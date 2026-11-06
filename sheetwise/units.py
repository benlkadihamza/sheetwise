from __future__ import annotations

import copy
from typing import Any, Dict


def project_in_centimeters(project: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a project dictionary to centimeters if stored in millimeters.

    Projects created before unit metadata was introduced used millimeters.
    """
    unit = project.get("unit")
    if unit == "cm":
        return project
    if unit is not None and unit != "mm":
        raise ValueError("Unsupported project unit")

    proj = copy.deepcopy(project)
    proj["unit"] = "cm"
    if "kerf" in proj and proj["kerf"] is not None:
        proj["kerf"] = proj["kerf"] / 10.0

    if "stock" in proj and isinstance(proj["stock"], list):
        for s in proj["stock"]:
            if isinstance(s, dict):
                s["w"] = s["w"] / 10.0
                s["h"] = s["h"] / 10.0

    if "parts" in proj and isinstance(proj["parts"], list):
        for p in proj["parts"]:
            if isinstance(p, dict):
                p["w"] = p["w"] / 10.0
                p["h"] = p["h"] / 10.0

    return proj


# Backwards compatibility alias matching JavaScript
projectInCentimeters = project_in_centimeters
