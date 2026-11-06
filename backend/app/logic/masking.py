import re


def mask_reg(reg: str) -> str:
    """'UP32 MK 4418' -> 'UP32 •• ••18'. keeps state + rto, hides the rest"""
    compact = re.sub(r"[^A-Za-z0-9]", "", reg).upper()
    if len(compact) < 6:
        return "•• •• ••••"
    return f"{compact[:4]} •• ••{compact[-2:]}"
