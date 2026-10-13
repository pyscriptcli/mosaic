from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import requests
import time
import random
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

class OverpassQueryRequest(BaseModel):
    query: str
    timeout: int = 90

class POIFetchRequest(BaseModel):
    lat: float
    lon: float
    radius: int
    tags: list[str]
    timeout: int = 90

@router.post("/query")
async def execute_overpass_query(req: OverpassQueryRequest):
    """
    Executes raw Overpass QL query with multi-endpoint failover and exponential backoff
    """
    for endpoint in settings.OVERPASS_ENDPOINTS:
        retries = 3
        delay = 1.0
        while retries > 0:
            try:
                url = f"{endpoint}?data={requests.utils.quote(req.query)}"
                res = requests.get(url, timeout=req.timeout)
                if res.status_code in [429, 503, 504]:
                    raise requests.exceptions.HTTPError(f"HTTP {res.status_code}")
                res.raise_for_status()
                data = res.json()
                if data and "elements" in data:
                    return data
            except Exception as e:
                logger.warning(f"Endpoint {endpoint} failed: {e}. Retries remaining: {retries - 1}")
                retries -= 1
                if retries == 0:
                    break
                time.sleep(delay + random.uniform(0, 0.5))
                delay *= 2

    raise HTTPException(status_code=502, detail="All Overpass API endpoints failed to respond.")

@router.post("/fetch-pois")
async def fetch_pois(req: POIFetchRequest):
    """
    Queries Overpass API for POIs around a coordinate, with automatic fallback to OSMnx
    """
    statements = "\n".join([f"  nwr[{tag}](around:{req.radius},{req.lat},{req.lon});" for tag in req.tags])
    ql = f"[out:json][timeout:{req.timeout}];(\n{statements}\n);\nout center;"

    for endpoint in settings.OVERPASS_ENDPOINTS:
        retries = 3
        delay = 1.0
        while retries > 0:
            try:
                url = f"{endpoint}?data={requests.utils.quote(ql)}"
                res = requests.get(url, timeout=req.timeout)
                if res.status_code in [429, 503, 504]:
                    raise requests.exceptions.HTTPError(f"HTTP {res.status_code}")
                res.raise_for_status()
                data = res.json()
                if not data or 'elements' not in data:
                    raise ValueError("Malformed JSON response")

                results = []
                for el in data['elements']:
                    el_lat = el.get('lat') or (el.get('center', {}).get('lat'))
                    el_lon = el.get('lon') or (el.get('center', {}).get('lon'))
                    if el_lat is None or el_lon is None:
                        continue
                    tags_dict = el.get('tags', {})
                    name = tags_dict.get('name', 'Unknown')
                    poi_type = tags_dict.get('amenity') or tags_dict.get('shop') or tags_dict.get('building') or 'Node'
                    results.append({
                        'lat': float(el_lat),
                        'lon': float(el_lon),
                        'name': str(name),
                        'type': str(poi_type),
                        'tags': tags_dict
                    })
                return {"source": "overpass", "count": len(results), "elements": results}
            except Exception as e:
                retries -= 1
                if retries == 0:
                    break
                time.sleep(delay + random.uniform(0, 0.5))
                delay *= 2

    # Fallback to OSMnx
    try:
        import osmnx as ox
        import pandas as pd
        tags_dict = {}
        for tag in req.tags:
            clean = tag.replace('"', '')
            if '=' in clean:
                k, v = clean.split('=', 1)
                if '|' in v:
                    tags_dict[k] = [x.strip() for x in v.split('|')]
                else:
                    tags_dict[k] = v
            else:
                tags_dict[clean] = True

        gdf = ox.geometries_from_point((req.lat, req.lon), tags_dict, dist=req.radius)
        results = []
        for idx, row in gdf.iterrows():
            geom = row.geometry
            lon_val, lat_val = (geom.x, geom.y) if geom.geom_type == 'Point' else (geom.centroid.x, geom.centroid.y)
            name = row.get('name', 'Unknown')
            poi_type = row.get('amenity') or row.get('shop') or row.get('building') or 'Node'
            results.append({
                'lat': float(lat_val),
                'lon': float(lon_val),
                'name': str(name) if pd.notna(name) else 'Unknown',
                'type': str(poi_type) if pd.notna(poi_type) else 'Node',
                'tags': {k: v for k, v in row.items() if k not in ['geometry', 'name', 'amenity', 'shop', 'building']}
            })
        return {"source": "osmnx", "count": len(results), "elements": results}
    except Exception as e:
        logger.error(f"OSMnx fallback also failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch POIs via Overpass and OSMnx: {str(e)}")
