from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import requests

router = APIRouter()

class RouteRequest(BaseModel):
    coordinates: List[List[float]]
    profile: str = "driving" # driving, walking, cycling

@router.post("/calculate")
async def calculate_osrm_route(req: RouteRequest):
    """
    Backend proxy for OSRM route calculations
    """
    if len(req.coordinates) < 2:
        raise HTTPException(status_code=400, detail="At least 2 coordinate waypoints required")

    coord_str = ";".join([f"{p[0]},{p[1]}" for p in req.coordinates])
    url = f"https://router.project-osrm.org/route/v1/{req.profile}/{coord_str}?overview=full&geometries=geojson&steps=true"

    try:
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing service error: {str(e)}")
