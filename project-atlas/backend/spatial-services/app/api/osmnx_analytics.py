from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json

router = APIRouter()

class IsochroneRequest(BaseModel):
    lat: float
    lon: float
    trip_times: List[int] = [5, 10, 15] # minutes
    travel_speed: float = 4.5 # km/h (walking) or 40.0 (driving)
    network_type: str = "walk" # walk, drive, bike

@router.post("/isochrone")
async def generate_isochrones(req: IsochroneRequest):
    """
    Generates reachability isochrone polygons using OSMnx network analysis
    """
    try:
        import osmnx as ox
        import networkx as nx
        from shapely.geometry import Point, Polygon
        import geopandas as gpd

        # Download street network around point
        max_dist = max(req.trip_times) * (req.travel_speed * 1000 / 60)
        G = ox.graph_from_point((req.lat, req.lon), dist=max_dist * 1.2, network_type=req.network_type)

        # Calculate travel time for each edge
        meters_per_minute = (req.travel_speed * 1000) / 60
        for u, v, k, data in G.edges(data=True, keys=True):
            data['time'] = data['length'] / meters_per_minute

        center_node = ox.distance.nearest_nodes(G, req.lon, req.lat)

        isochrone_polys = []
        for trip_time in sorted(req.trip_times, reverse=True):
            subgraph = nx.ego_graph(G, center_node, radius=trip_time, distance='time')
            node_points = [Point((data['x'], data['y'])) for node, data in subgraph.nodes(data=True)]
            nodes_gdf = gpd.GeoDataFrame({'id': range(len(node_points))}, geometry=node_points)
            
            # Convex hull / alpha shape buffer
            poly = nodes_gdf.unary_union.convex_hull.buffer(0.0005)
            isochrone_polys.append({
                "time_minutes": trip_time,
                "geometry": json.loads(gpd.GeoSeries([poly]).to_json())['features'][0]['geometry']
            })

        return {"isochrones": isochrone_polys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OSMnx isochrone computation error: {str(e)}")
