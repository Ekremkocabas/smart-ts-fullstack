from fastapi import FastAPI, APIRouter, HTTPException, Response, Query, Depends, Header, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from bson import ObjectId
import os
import logging
import asyncio
import base64
import binascii
import io
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Set, Any, Union, Tuple
import uuid
from datetime import datetime, timedelta, timezone
import hashlib
import time

# ==================== IN-MEMORY CACHE ====================
_cache: Dict[str, Any] = {}
_cache_ttl: Dict[str, float] = {}

def get_cache(key: str, ttl_seconds: int = 60):
    if key in _cache and time.time() - _cache_ttl.get(key, 0) < ttl_seconds:
        logging.debug("Cache HIT: %s", key)
        return _cache[key]
    logging.debug("Cache MISS: %s", key)
    return None

def set_cache(key: str, value: Any):
    _cache[key] = value
    _cache_ttl[key] = time.time()
    logging.debug("Cache SET: %s", key)

def clear_cache(prefix: str = None):
    if prefix:
        for k in [k for k in list(_cache.keys()) if k.startswith(prefix)]:
            _cache.pop(k, None)
            _cache_ttl.pop(k, None)
    else:
        _cache.clear()
        _cache_ttl.clear()
# =========================================================
import resend
import requests
import jwt
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
APP_URL = os.environ.get('APP_URL', 'https://expo-fastapi-1.preview.emergentagent.com').strip()

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. Application cannot start without it.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Resend configuration
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@signybon.com')
COMPANY_EMAIL = ""  # Per-company email comes from instellingen
WERKBON_RECIPIENT_EMAIL = ""  # Per-company werkbon recipient from instellingen

# (COMPANY_INFO removed — all PDF functions now use instellingen from MongoDB)

# Legal text for signature (used in all werkbons) - Updated per user request
LEGAL_TEXT = (
    "Door ondertekening bevestigt de klant de juistheid van alle bovenstaande gegevens. "
    "Deze werkbon dient als grondslag voor facturatie. "
    "Bezwaren dienen schriftelijk gemeld te worden binnen 5 werkdagen na ondertekening, "
    "bij gebreke waarvan de werkbon als definitief goedgekeurd geldt. "
    "De digitale handtekening heeft dezelfde rechtskracht als een handgeschreven handtekening."
)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'werkbon_db')]

# GridFS setup for file storage (bypasses 16MB document limit)
gridfs_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="files")

# Create the main app without a prefix
app = FastAPI()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ==================== GRIDFS HELPER FUNCTIONS ====================

async def store_file_to_gridfs(data: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Store binary data to GridFS and return the file_id as string"""
    try:
        file_id = await gridfs_bucket.upload_from_stream(
            filename,
            data,
            metadata={"content_type": content_type, "uploaded_at": datetime.now(timezone.utc).isoformat()}
        )
        return str(file_id)
    except Exception as e:
        logging.error(f"Failed to store file in GridFS: {e}")
        raise

async def store_base64_to_gridfs(base64_data: str, filename: str, content_type: str = "image/png") -> str:
    """Store base64 encoded data to GridFS and return file_id"""
    try:
        # Handle data URL format (e.g., "data:image/png;base64,...")
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        
        binary_data = base64.b64decode(base64_data)
        return await store_file_to_gridfs(binary_data, filename, content_type)
    except Exception as e:
        logging.error(f"Failed to decode and store base64 data: {e}")
        raise

async def get_file_from_gridfs(file_id: str) -> Optional[bytes]:
    """Retrieve file data from GridFS by file_id"""
    try:
        grid_out = await gridfs_bucket.open_download_stream(ObjectId(file_id))
        data = await grid_out.read()
        return data
    except Exception as e:
        logging.error(f"Failed to retrieve file from GridFS: {e}")
        return None

async def get_file_as_base64(file_id: str) -> Optional[str]:
    """Retrieve file from GridFS and return as base64 string"""
    data = await get_file_from_gridfs(file_id)
    if data:
        return base64.b64encode(data).decode('utf-8')
    return None

async def delete_file_from_gridfs(file_id: str) -> bool:
    """Delete a file from GridFS"""
    try:
        await gridfs_bucket.delete(ObjectId(file_id))
        return True
    except Exception as e:
        logging.error(f"Failed to delete file from GridFS: {e}")
        return False

def is_gridfs_id(value: str) -> bool:
    """Check if a string is a valid GridFS ObjectId (24 hex characters)"""
    if not value or not isinstance(value, str):
        return False
    # GridFS IDs are 24 character hex strings
    if len(value) == 24:
        try:
            ObjectId(value)
            return True
        except Exception:
            return False
    return False

async def get_image_data_for_pdf(value: Optional[str]) -> Optional[bytes]:
    """Get image data for PDF generation - handles both GridFS IDs and base64"""
    if not value:
        return None
    
    # Check if it's a GridFS ID
    if is_gridfs_id(value):
        return await get_file_from_gridfs(value)
    
    # Otherwise treat as base64
    try:
        if "," in value:
            value = value.split(",")[1]
        return base64.b64decode(value)
    except (ValueError, binascii.Error, Exception) as e:
        logger.warning(f"Base64 decode failed for value length={len(str(value)) if value else 0}: {type(e).__name__}")
        return None

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# ==================== ROLE & PERMISSION SYSTEM ====================

# Valid roles in the system
VALID_ROLES: Set[str] = {
    "platform_admin",  # Signybon platform owner — sees all tenants
    "master_admin",
    "admin",
    "planner",
    "worker",
    "onderaannemer"
}

# Hardcoded platform owner email — gets platform_admin role on every login
PLATFORM_ADMIN_EMAIL = "info@signybon.com"

# Platform access rules - V1
WEB_PANEL_ROLES: Set[str] = {"platform_admin", "master_admin", "admin", "planner"}
MOBILE_APP_ROLES: Set[str] = {"worker", "onderaannemer"}

# Legacy role mapping - V1
LEGACY_ROLE_MAPPING: Dict[str, str] = {
    "platform_admin": "platform_admin",
    "admin": "admin",
    "beheerder": "admin",
    "manager": "planner",
    "ploegbaas": "worker",
    "werknemer": "worker",
    "onderaannemer": "onderaannemer"
}

# Roles that each role can assign - V1
ROLE_ASSIGNMENT_PERMISSIONS: Dict[str, Set[str]] = {
    "platform_admin": {"platform_admin", "master_admin", "admin", "planner", "worker", "onderaannemer"},
    "master_admin": {"master_admin", "admin", "planner", "worker", "onderaannemer"},
    "admin": {"admin", "planner", "worker", "onderaannemer"},
    "planner": set(),
    "worker": set(),
    "onderaannemer": set(),
}

# Permissions per role - V1
ROLE_PERMISSIONS: Dict[str, Dict[str, bool]] = {
    "platform_admin": {
        "can_manage_platform": True,
        "can_manage_all_companies": True,
        "can_manage_settings": True,
        "can_manage_branding": True,
        "can_manage_users": True,
        "can_manage_klanten": True,
        "can_manage_werven": True,
        "can_manage_planning": True,
        "can_manage_werkbonnen": True,
        "can_view_reports": True,
    },
    "master_admin": {
        "can_manage_all_companies": True,
        "can_manage_settings": True,
        "can_manage_branding": True,
        "can_manage_users": True,
        "can_manage_klanten": True,
        "can_manage_werven": True,
        "can_manage_planning": True,
        "can_manage_werkbonnen": True,
        "can_view_reports": True,
    },
    "admin": {
        "can_manage_settings": True,
        "can_manage_branding": True,
        "can_manage_users": True,
        "can_manage_klanten": True,
        "can_manage_werven": True,
        "can_manage_planning": True,
        "can_manage_werkbonnen": True,
        "can_view_reports": True,
    },
    "planner": {
        "can_view_users": True,
        "can_view_klanten": True,
        "can_view_werven": True,
        "can_manage_planning": True,
        "can_view_werkbonnen": True,
        "can_view_reports": True,
    },
    "worker": {
        "can_view_own_planning": True,
        "can_create_werkbon": True,
        "can_view_own_werkbonnen": True,
    },
    "onderaannemer": {
        "can_view_own_planning": True,
        "can_create_werkbon": True,
        "can_view_own_werkbonnen": True,
    },
}

def normalize_role(role: str) -> str:
    """Map legacy role to new role system"""
    if role in VALID_ROLES:
        return role
    return LEGACY_ROLE_MAPPING.get(role, "worker")

def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission"""
    normalized = normalize_role(role)
    role_perms = ROLE_PERMISSIONS.get(normalized, {})
    return role_perms.get(permission, False)

def can_assign_role(assigner_role: str, target_role: str) -> bool:
    """Check if a role can assign another role"""
    normalized_assigner = normalize_role(assigner_role)
    normalized_target = normalize_role(target_role)
    allowed = ROLE_ASSIGNMENT_PERMISSIONS.get(normalized_assigner, set())
    return normalized_target in allowed

def has_web_access(role: str) -> bool:
    """Check if role has web panel access"""
    return normalize_role(role) in WEB_PANEL_ROLES

def has_app_access(role: str) -> bool:
    """Check if role has mobile app access"""
    return normalize_role(role) in MOBILE_APP_ROLES

# ==================== JWT AUTH HELPERS ====================

def create_jwt_token(user_id: str, email: str, role: str, company_id: str) -> str:
    """Create a JWT token for authenticated user"""
    payload = {
        "user_id": user_id,
        "email": email,
        "role": normalize_role(role),
        "company_id": company_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[Dict]:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    authorization: Optional[str] = Header(None)
) -> Dict:
    """
    Get current authenticated user from JWT token.
    Validates token server-side and fetches fresh user data from database.
    """
    token = None
    
    # Try to get token from Bearer auth
    if credentials:
        token = credentials.credentials
    # Fallback to Authorization header
    elif authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="Authenticatie vereist")
    
    payload = decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Ongeldige of verlopen token")
    
    # Fetch fresh user data from database (server-side validation)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Gebruiker niet gevonden")
    
    if not user.get("actief", True):
        raise HTTPException(status_code=401, detail="Account is gedeactiveerd")

    # Resolve company_id with self-heal for users whose record was created
    # before multi-tenant scoping was enforced. Avoid the "default_company"
    # fallback for non-legacy users — that path leaks Smart-Tech data.
    company_id = user.get("company_id")
    normalized_role = normalize_role(user.get("rol", "worker"))
    # Treat "default_company" as suspicious for any user that actually owns
    # a separate company entry — this catches Atanas-style cases where the
    # user record was stamped with the legacy id by an earlier code path.
    if company_id == "default_company" and normalized_role in ("master_admin", "admin"):
        owned = await db.companies.find_one(
            {"$or": [{"email": user["email"]}, {"contact_email": user["email"]}]},
            {"_id": 0, "id": 1},
        )
        if owned and owned.get("id") and owned["id"] != "default_company":
            company_id = owned["id"]
            try:
                await db.users.update_one({"id": user["id"]}, {"$set": {"company_id": company_id}})
            except Exception as exc:
                logging.warning("[get_current_user] default_company repair failed: %s", exc)
    if not company_id:
        if normalized_role in ("master_admin", "admin"):
            # Try to find a company that belongs to this admin via email match
            company_doc = await db.companies.find_one(
                {"$or": [{"email": user["email"]}, {"contact_email": user["email"]}]},
                {"_id": 0, "id": 1},
            )
            if company_doc and company_doc.get("id"):
                company_id = company_doc["id"]
            else:
                # No legacy match — isolate by user id so they cannot read other tenants
                company_id = f"user:{user['id']}"
            # Persist the repair so future requests are stable
            try:
                await db.users.update_one({"id": user["id"]}, {"$set": {"company_id": company_id}})
            except Exception as exc:
                logging.warning("[get_current_user] company_id self-heal persist failed: %s", exc)
        else:
            # Workers without company_id: isolate by user id
            company_id = f"user:{user['id']}"

    # Return validated user data with normalized role
    return {
        "user_id": user["id"],
        "email": user["email"],
        "naam": user.get("naam", ""),
        "role": normalize_role(user.get("rol", "worker")),
        "company_id": company_id,
    }

async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[Dict]:
    """Get current user if authenticated, None otherwise"""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None

def require_roles(allowed_roles: List[str]):
    """Dependency factory that requires specific roles"""
    async def role_checker(current_user: Dict = Depends(get_current_user)) -> Dict:
        normalized_allowed = {normalize_role(r) for r in allowed_roles}
        if current_user["role"] not in normalized_allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Geen toegang. Vereiste rol: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker

def require_web_access():
    """Dependency that requires web panel access"""
    async def checker(current_user: Dict = Depends(get_current_user)) -> Dict:
        if not has_web_access(current_user["role"]):
            raise HTTPException(
                status_code=403,
                detail="Geen toegang tot webpaneel. Gebruik de mobiele app."
            )
        return current_user
    return checker

def require_permission(permission: str):
    """Dependency factory that requires a specific permission"""
    async def permission_checker(current_user: Dict = Depends(get_current_user)) -> Dict:
        if not has_permission(current_user["role"], permission):
            raise HTTPException(
                status_code=403,
                detail=f"Geen toegang. Vereiste permissie: {permission}"
            )
        return current_user
    return permission_checker

# ==================== MODELS ====================

# ==================== COMPANY SETTINGS MODELS (Phase 1) ====================

class AdresGestructureerd(BaseModel):
    """Structured address fields for company"""
    straat: Optional[str] = None
    huisnummer: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    land: str = "België"

class EmailConfig(BaseModel):
    """Email configuration for company"""
    uitgaand_algemeen: Optional[str] = None   # General outgoing sender
    inkomend_werkbon: Optional[str] = None    # Werkbon-specific inbox (deprecated, prefer werkbon_email)

class BrandingConfig(BaseModel):
    """Branding configuration for company"""
    logo_url: Optional[str] = None            # URL or file path (NOT base64)
    primaire_kleur: Optional[str] = None
    accent_kleur: Optional[str] = None

class PdfTekstenConfig(BaseModel):
    """PDF text configuration for company"""
    algemene_voettekst: Optional[str] = None
    uren_klant_bevestiging: Optional[str] = None
    oplevering_klant_bevestiging: Optional[str] = None
    project_werkbon_klant_bevestiging: Optional[str] = None

class CompanySettings(BaseModel):
    """Company settings - company-based, not singleton"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str                           # Unique company identifier
    
    # Basic info
    bedrijfsnaam: str = "Signybon"
    btw_nummer: Optional[str] = None
    telefoon: Optional[str] = None
    website: Optional[str] = None
    
    # === LEGACY FIELDS (backward compatibility) ===
    email: Optional[str] = None               # Legacy
    admin_emails: List[str] = Field(default_factory=list)
    adres: Optional[str] = None               # Legacy address string
    postcode: Optional[str] = None            # Legacy
    stad: Optional[str] = None                # Legacy
    kvk_nummer: Optional[str] = None          # Legacy
    logo_base64: Optional[str] = None         # Legacy (temporary)
    pdf_voettekst: Optional[str] = None       # Legacy
    uren_confirmation_text: Optional[str] = None
    oplevering_confirmation_text: Optional[str] = None
    project_confirmation_text: Optional[str] = None
    primary_color: Optional[str] = None       # Legacy
    secondary_color: Optional[str] = None     # Legacy
    accent_color: Optional[str] = None        # Legacy
    selfie_activeren: bool = False
    sms_verificatie_activeren: bool = False
    automatisch_naar_klant: bool = False
    
    # === NEW STRUCTURED FIELDS ===
    adres_gestructureerd: Optional[AdresGestructureerd] = None
    emails: Optional[EmailConfig] = None
    branding: Optional[BrandingConfig] = None
    pdf_teksten: Optional[PdfTekstenConfig] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class CompanySettingsUpdate(BaseModel):
    """Update model for company settings"""
    bedrijfsnaam: Optional[str] = None
    btw_nummer: Optional[str] = None
    telefoon: Optional[str] = None
    website: Optional[str] = None
    
    # Legacy fields (for backward compatibility)
    email: Optional[str] = None
    admin_emails: Optional[List[str]] = None
    adres: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    kvk_nummer: Optional[str] = None
    logo_base64: Optional[str] = None
    pdf_voettekst: Optional[str] = None
    uren_confirmation_text: Optional[str] = None
    oplevering_confirmation_text: Optional[str] = None
    project_confirmation_text: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    selfie_activeren: Optional[bool] = None
    sms_verificatie_activeren: Optional[bool] = None
    automatisch_naar_klant: Optional[bool] = None
    
    # New structured fields
    adres_gestructureerd: Optional[AdresGestructureerd] = None
    emails: Optional[EmailConfig] = None
    branding: Optional[BrandingConfig] = None
    pdf_teksten: Optional[PdfTekstenConfig] = None

# ==================== COMPANY SETTINGS HELPERS ====================

def get_company_address(settings: dict) -> str:
    """Get company address - prefer new structured fields, fallback to legacy"""
    gestructureerd = settings.get("adres_gestructureerd")
    if gestructureerd and isinstance(gestructureerd, dict):
        parts = [
            gestructureerd.get("straat", ""),
            gestructureerd.get("huisnummer", ""),
            gestructureerd.get("postcode", ""),
            gestructureerd.get("stad", ""),
        ]
        full = " ".join(p for p in parts if p).strip()
        if full:
            return full
    # Fallback to legacy fields
    legacy_parts = [
        settings.get("adres", ""),
        settings.get("postcode", ""),
        settings.get("stad", ""),
    ]
    return " ".join(p for p in legacy_parts if p).strip()

def get_company_email(settings: dict, email_type: str = "uitgaand_algemeen") -> str:
    """Get company email - prefer new structured fields, fallback to legacy"""
    emails = settings.get("emails")
    if emails and isinstance(emails, dict):
        email = emails.get(email_type)
        if email:
            return email
    # Fallback to legacy
    return settings.get("email") or COMPANY_EMAIL

def is_dark_color(hex_color: str) -> bool:
    """Return True if hex_color has low luminance (needs white text on top)."""
    try:
        h = hex_color.lstrip('#')
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        return luminance < 0.5
    except Exception:
        return True  # assume dark if invalid

def get_pdf_colors(instellingen: dict) -> dict:
    """Get werkbon PDF colors — ONLY from werkbon_* fields, never from branding colors.

    Defaults are the Signybon brand palette (green/gold). NEVER use a legacy
    Smart-Tech color (orange / dark navy) as a fallback — that would leak the
    look of one tenant onto every other tenant who hasn't picked colors yet.
    """
    primary   = instellingen.get("werkbon_primary_color")   or "#1B4332"
    secondary = instellingen.get("werkbon_secondary_color") or "#D4A017"
    accent    = instellingen.get("werkbon_accent_color")    or "#1B4332"
    return {"primary": primary, "secondary": secondary, "accent": accent}

def get_company_address_2lines(settings: dict) -> tuple[str, str]:
    """Return (straat+nr, postcode+stad) as two separate lines for PDF headers."""
    gestructureerd = settings.get("adres_gestructureerd") or {}
    if gestructureerd and isinstance(gestructureerd, dict):
        straat = " ".join(filter(None, [gestructureerd.get("straat", ""), gestructureerd.get("huisnummer", "")])).strip()
        postcode_stad = " ".join(filter(None, [gestructureerd.get("postcode", ""), gestructureerd.get("stad", "")])).strip()
        if straat or postcode_stad:
            return straat, postcode_stad
    # Legacy fallback
    return settings.get("adres", ""), " ".join(filter(None, [settings.get("postcode", ""), settings.get("stad", "")])).strip()

def get_company_logo(settings: dict) -> Optional[str]:
    """Get company logo - prefer new URL, fallback to base64"""
    branding = settings.get("branding")
    if branding and isinstance(branding, dict):
        logo_url = branding.get("logo_url")
        if logo_url:
            return logo_url
    # Fallback to legacy base64
    return settings.get("logo_base64")


def make_logo_or_brand_flowable(instellingen: dict, width_mm: float, height_mm: float):
    """Return a ReportLab flowable for the top-left "logo slot" on PDFs.

    Rule (multi-tenant brand isolation): if THIS tenant has uploaded a logo we
    render it; otherwise we render the tenant's bedrijfsnaam in caps. We never
    fall back to a Signybon platform logo — that would brand another tenant's
    document as if Signybon issued it. Keeps PDFs unmistakably the customer's.
    """
    from reportlab.platypus import Paragraph as _Paragraph
    from reportlab.lib.styles import ParagraphStyle as _PS

    logo_bytes = decode_base64_data(get_company_logo(instellingen))
    if logo_bytes:
        img = make_safe_reportlab_image(logo_bytes, width_mm, height_mm)
        if img is not None:
            return img

    # Brand-color title fallback so the slot stays visually balanced.
    _C = get_pdf_colors(instellingen)
    bedrijfsnaam = (instellingen.get("bedrijfsnaam") or "Signybon").upper()
    # Cap length so a very long company name doesn't crash out of the cell.
    if len(bedrijfsnaam) > 24:
        bedrijfsnaam = bedrijfsnaam[:24]
    return _Paragraph(
        f"<b>{bedrijfsnaam}</b>",
        _PS(
            "BrandFallback",
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=16,
            textColor=colors.HexColor(_C["primary"]),
            alignment=1,  # center
        ),
    )

def get_company_color(settings: dict, color_type: str = "primary") -> str:
    """Get company color — prefer structured branding fields, fallback to legacy
    flat fields, and finally to the Signybon brand palette. NEVER falls back to
    any legacy Smart-Tech color so tenants without picked colors see Signybon's
    defaults, not another tenant's identity."""
    branding = settings.get("branding")
    if branding and isinstance(branding, dict):
        if color_type == "primary":
            color = branding.get("primaire_kleur")
        else:
            color = branding.get("accent_kleur")
        if color:
            return color
    # Fallback chain: legacy flat field → Signybon brand color
    if color_type == "primary":
        return settings.get("primary_color") or "#1B4332"
    return settings.get("accent_color") or settings.get("secondary_color") or "#D4A017"

def get_pdf_text(settings: dict, text_type: str) -> str:
    """Get PDF text - prefer new structured fields, fallback to legacy"""
    pdf_teksten = settings.get("pdf_teksten")
    if pdf_teksten and isinstance(pdf_teksten, dict):
        text = pdf_teksten.get(text_type)
        if text:
            return text
    
    # Fallback mapping
    legacy_mapping = {
        "algemene_voettekst": "pdf_voettekst",
        "uren_klant_bevestiging": "uren_confirmation_text",
        "oplevering_klant_bevestiging": "oplevering_confirmation_text",
        "project_werkbon_klant_bevestiging": "project_confirmation_text",
    }
    legacy_key = legacy_mapping.get(text_type)
    if legacy_key:
        return settings.get(legacy_key) or ""
    return ""

# ==================== USER MODEL (Phase 1 - No plain password!) ====================

class User(BaseModel):
    """User model - updated for Phase 1 SaaS architecture"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    
    email: str
    password_hash: str
    # wachtwoord_plain: REMOVED - no plain password storage!
    
    naam: str
    rol: str = "worker"                       # NEW: Default is now "worker"
    team_id: Optional[str] = None
    telefoon: Optional[str] = None
    actief: bool = True
    werkbon_types: List[str] = Field(default_factory=lambda: ["uren"])
    mag_wachtwoord_wijzigen: bool = True      # NEW: Default True
    push_token: Optional[str] = None
    
    # Platform access fields
    web_access: Optional[bool] = None         # None = calculate from role
    app_access: Optional[bool] = None         # None = calculate from role
    
    # NEW: Password management fields
    password_changed_at: Optional[datetime] = None
    must_change_password: bool = False
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: str
    password: str
    naam: str
    rol: str = "worker"

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    """User response model - no plain password exposed"""
    id: str
    email: str
    naam: str
    rol: str
    company_id: str = "default_company"
    team_id: Optional[str] = None
    telefoon: Optional[str] = None
    actief: bool
    werkbon_types: List[str] = Field(default_factory=lambda: ["uren"])
    mag_wachtwoord_wijzigen: bool = True
    must_change_password: bool = False
    # Platform access info - Optional to handle None values from DB
    web_access: Optional[bool] = False
    app_access: Optional[bool] = True
    # Push notification token
    push_token: Optional[str] = None

class UserUpdate(BaseModel):
    naam: Optional[str] = None
    rol: Optional[str] = None
    team_id: Optional[str] = None
    telefoon: Optional[str] = None
    actief: Optional[bool] = None
    werkbon_types: Optional[List[str]] = None
    mag_wachtwoord_wijzigen: Optional[bool] = None
    must_change_password: Optional[bool] = None
    # For admin password reset (generates new hash, no plain storage)
    new_password: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    """Request model for password change"""
    current_password: str
    new_password: str
    confirm_password: str

class LoginResponse(BaseModel):
    """Enhanced login response with JWT and platform access info"""
    user: UserResponse
    token: str
    platform_access: str  # "web", "app", or "both"
    valid_roles: List[str]

class ResendInfoMailResponse(BaseModel):
    user: UserResponse
    email_sent: bool
    email_error: Optional[str] = None
    temp_password: str

# Team Model (Ekip)
class Team(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    naam: str
    leden: List[str] = []  # List of team member names
    actief: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TeamCreate(BaseModel):
    naam: str
    leden: List[str] = []

class TeamUpdate(BaseModel):
    naam: Optional[str] = None
    leden: Optional[List[str]] = None

# ============================================
# Klant (Customer) Model - Professional B2B
# ============================================

class KlantAdres(BaseModel):
    """Structured address for klant"""
    straat: str = ""
    huisnummer: str = ""
    bus: str = ""
    postcode: str = ""
    stad: str = ""
    land: str = "België"

class ContactPersoon(BaseModel):
    """Contact person within a klant organization"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    naam: str = ""
    functie: str = ""  # Predefined: electricien, hulp_electricien, werfleider, projectleider, or custom
    email: str = ""
    telefoon: str = ""
    gsm: str = ""
    opmerkingen: str = ""
    is_primair: bool = False

# Predefined contact roles for UI suggestions
CONTACT_FUNCTIE_SUGGESTIONS = [
    "electricien",
    "hulp_electricien", 
    "werfleider",
    "projectleider",
    "aankoper",
    "boekhouder",
    "zaakvoerder",
]

# Pricing models (legacy: regie → dagvergoeding, nog_te_bepalen → uurtarief in migrate_klant_data)
PRIJS_MODELLEN = ["uurtarief", "vaste_prijs", "dagvergoeding"]

class Klant(BaseModel):
    """
    Professional B2B Customer Model
    Supports company identity, contacts, pricing, billing, and communication settings
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"
    
    # A. BEDRIJFSGEGEVENS
    bedrijfsnaam: str = ""                    # Primary name field
    naam: str = ""                            # Legacy field (backward compat) - maps to bedrijfsnaam
    btw_nummer: str = ""
    ondernemingsnummer: str = ""
    type_klant: str = "bedrijf"               # bedrijf / particulier
    algemeen_email: str = ""                  # Optional - validate in UI where needed
    email: str = ""                           # Legacy field (backward compat) - maps to algemeen_email
    algemeen_telefoon: str = ""
    telefoon: Optional[str] = None            # Legacy field
    website: str = ""
    
    # B. GESTRUCTUREERD ADRES
    adres: Optional[str] = None               # Legacy string field (backward compat)
    adres_structured: KlantAdres = Field(default_factory=KlantAdres)
    
    # C. CONTACTPERSONEN (multiple)
    contactpersonen: List[ContactPersoon] = Field(default_factory=list)
    
    # D. COMMUNICATIE / MAIL
    klant_mail_sturen: bool = True            # Whether to send mail to this klant
    primary_mail_recipient: str = ""          # Primary email for werkbon mails
    cc_mail_recipient: str = ""               # CC email
    
    # E. COMMERCIEEL / PRIJSAFSPRAKEN
    prijsmodel: str = "uurtarief"             # uurtarief / vaste_prijs / dagvergoeding
    standaard_uurtarief: float = 0.0
    uurtarief: float = 0.0                    # Legacy field - maps to standaard_uurtarief
    km_vergoeding_tarief: Optional[float] = 0.0
    standaard_dagtarief: float = 0.0           # Legacy; UI no longer edits
    dag_prijs: float = 0.0
    halve_dag_prijs: float = 0.0
    kwart_prijs: float = 0.0
    standaard_vaste_prijs: float = 0.0
    betaaltermijn: int = 30                   # Legacy days; prefer betaaltermijn_keuze
    betaaltermijn_keuze: str = "30"           # "15"|"30"|"45"|"60"|"zo_snel_mogelijk"
    interne_opmerking_prijsafspraak: str = ""
    prijsafspraak: Optional[str] = None       # Legacy field
    
    # F. FACTURATIE
    facturatie_email: str = ""
    facturatie_telefoon: str = ""
    facturatie_contactpersoon: str = ""
    facturatie_adres_zelfde: bool = True      # If True, use main address
    facturatie_adres: Optional[KlantAdres] = None  # Optional - only if facturatie_adres_zelfde=False
    
    # G. EXTRA / ADMIN
    klantnummer: str = ""                     # Auto-generated: KL-YYYY-NNNN
    interne_referentie: str = ""
    opmerkingen: str = ""
    
    # Status - actief is the primary field (backward compat)
    actief: bool = True
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

class KlantCreate(BaseModel):
    """Create payload for new klant - all new fields supported"""
    # Required
    bedrijfsnaam: str
    
    # Legacy support - if provided, maps to new fields
    naam: Optional[str] = None                # Maps to bedrijfsnaam if bedrijfsnaam empty
    email: Optional[str] = None               # Maps to algemeen_email
    
    # A. Bedrijfsgegevens
    btw_nummer: str = ""
    ondernemingsnummer: str = ""
    type_klant: str = "bedrijf"
    algemeen_email: str = ""
    algemeen_telefoon: str = ""
    telefoon: Optional[str] = None            # Legacy
    website: str = ""
    
    # B. Adres
    adres: Optional[str] = None               # Legacy
    adres_structured: Optional[KlantAdres] = None
    
    # C. Contactpersonen
    contactpersonen: List[ContactPersoon] = Field(default_factory=list)
    
    # D. Communicatie
    klant_mail_sturen: bool = True
    primary_mail_recipient: str = ""
    cc_mail_recipient: str = ""
    
    # E. Prijsafspraken
    prijsmodel: str = "uurtarief"
    standaard_uurtarief: float = 0.0
    uurtarief: float = 0.0                    # Legacy
    km_vergoeding_tarief: float = 0.0
    standaard_dagtarief: float = 0.0
    dag_prijs: float = 0.0
    halve_dag_prijs: float = 0.0
    kwart_prijs: float = 0.0
    standaard_vaste_prijs: float = 0.0
    betaaltermijn: int = 30
    betaaltermijn_keuze: str = "30"
    interne_opmerking_prijsafspraak: str = ""
    prijsafspraak: Optional[str] = None       # Legacy
    
    # F. Facturatie
    facturatie_email: str = ""
    facturatie_telefoon: str = ""
    facturatie_contactpersoon: str = ""
    facturatie_adres_zelfde: bool = True
    facturatie_adres: Optional[KlantAdres] = None
    
    # G. Extra
    interne_referentie: str = ""
    opmerkingen: str = ""

    # H. Billing
    btw_percentage: Optional[int] = 21

# Helper function to generate klantnummer
async def generate_klantnummer(db) -> str:
    """Generate unique klantnummer in format KL-YYYY-NNNN"""
    year = datetime.now(timezone.utc).year
    prefix = f"KL-{year}-"
    
    # Find highest existing number for this year
    existing = await db.klanten.find(
        {"klantnummer": {"$regex": f"^{prefix}"}},
        {"klantnummer": 1}
    ).sort("klantnummer", -1).limit(1).to_list(1)
    
    if existing and existing[0].get("klantnummer"):
        try:
            last_num = int(existing[0]["klantnummer"].split("-")[-1])
            new_num = last_num + 1
        except (ValueError, AttributeError):
            new_num = 1
    else:
        new_num = 1
    
    return f"{prefix}{new_num:04d}"

# Helper to serialize MongoDB documents for JSON response
def serialize_mongo_doc(doc: dict) -> dict:
    """Convert MongoDB-specific types to JSON-serializable types"""
    if doc is None:
        return doc
    result = {}
    for key, value in doc.items():
        if key == '_id':
            result[key] = str(value)  # Convert ObjectId to string
        elif hasattr(value, '__class__') and value.__class__.__name__ == 'ObjectId':
            result[key] = str(value)  # Convert any ObjectId to string
        elif isinstance(value, datetime):
            result[key] = value.isoformat()  # Convert datetime to ISO string
        elif isinstance(value, dict):
            result[key] = serialize_mongo_doc(value)
        elif isinstance(value, list):
            result[key] = [
                serialize_mongo_doc(item) if isinstance(item, dict) 
                else str(item) if hasattr(item, '__class__') and item.__class__.__name__ == 'ObjectId'
                else item 
                for item in value
            ]
        else:
            result[key] = value
    return result

# Helper to migrate old klant data to new structure
def migrate_klant_data(klant_dict: dict) -> dict:
    """Migrate old klant format to new professional structure"""
    # First serialize MongoDB types
    klant_dict = serialize_mongo_doc(klant_dict)
    
    # Map legacy fields to new fields
    if not klant_dict.get("bedrijfsnaam") and klant_dict.get("naam"):
        klant_dict["bedrijfsnaam"] = klant_dict["naam"]
    
    if not klant_dict.get("algemeen_email") and klant_dict.get("email"):
        klant_dict["algemeen_email"] = klant_dict["email"]
    
    if not klant_dict.get("algemeen_telefoon") and klant_dict.get("telefoon"):
        klant_dict["algemeen_telefoon"] = klant_dict["telefoon"]
    
    if not klant_dict.get("standaard_uurtarief") and klant_dict.get("uurtarief"):
        klant_dict["standaard_uurtarief"] = klant_dict["uurtarief"]
    if klant_dict.get("standaard_uurtarief") and not klant_dict.get("uurtarief"):
        klant_dict["uurtarief"] = klant_dict["standaard_uurtarief"]
    
    if not klant_dict.get("interne_opmerking_prijsafspraak") and klant_dict.get("prijsafspraak"):
        klant_dict["interne_opmerking_prijsafspraak"] = klant_dict["prijsafspraak"]
    
    # Ensure adres_structured exists
    if not klant_dict.get("adres_structured"):
        klant_dict["adres_structured"] = {
            "straat": "", "huisnummer": "", "bus": "",
            "postcode": "", "stad": "", "land": "België"
        }
    
    # Ensure contactpersonen is a list
    if not klant_dict.get("contactpersonen"):
        klant_dict["contactpersonen"] = []
    
    # Ensure defaults for new fields
    klant_dict.setdefault("type_klant", "bedrijf")
    klant_dict.setdefault("website", "")
    klant_dict.setdefault("klant_mail_sturen", True)
    klant_dict.setdefault("primary_mail_recipient", "")
    klant_dict.setdefault("cc_mail_recipient", "")
    klant_dict.setdefault("prijsmodel", "uurtarief")
    klant_dict.setdefault("standaard_dagtarief", 0.0)
    klant_dict.setdefault("dag_prijs", 0.0)
    klant_dict.setdefault("halve_dag_prijs", 0.0)
    klant_dict.setdefault("kwart_prijs", 0.0)
    klant_dict.setdefault("standaard_vaste_prijs", 0.0)
    klant_dict.setdefault("betaaltermijn", 30)

    # Prijsmodel legacy → nieuw
    pm = klant_dict.get("prijsmodel")
    if pm == "regie":
        klant_dict["prijsmodel"] = "dagvergoeding"
    elif pm == "nog_te_bepalen":
        klant_dict["prijsmodel"] = "uurtarief"

    # Betaaltermijn: voorkeur string; vul van legacy int
    if not klant_dict.get("betaaltermijn_keuze"):
        b = klant_dict.get("betaaltermijn")
        try:
            bi = int(b) if b is not None else 30
        except (TypeError, ValueError):
            bi = 30
        if bi in (15, 30, 45, 60):
            klant_dict["betaaltermijn_keuze"] = str(bi)
        else:
            klant_dict["betaaltermijn_keuze"] = "30"
    klant_dict.setdefault("facturatie_email", "")
    klant_dict.setdefault("facturatie_telefoon", "")
    klant_dict.setdefault("facturatie_contactpersoon", "")
    klant_dict.setdefault("facturatie_adres_zelfde", True)
    klant_dict.setdefault("klantnummer", "")
    klant_dict.setdefault("interne_referentie", "")
    klant_dict.setdefault("opmerkingen", "")
    
    return klant_dict

# Werf (Worksite) Model
class Werf(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    naam: str
    klant_id: str
    adres: Optional[str] = None
    actief: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WerfCreate(BaseModel):
    naam: str
    klant_id: str
    adres: Optional[str] = None

# Werkbon (Timesheet) Model - Updated
class UrenRegel(BaseModel):
    teamlid_naam: str = ""  # Made optional with default for old records
    naam: Optional[str] = None  # Alternative field name used in some old records
    # Days can be either float (hours) or string (afkorting like V, OV, Z, BV, F, ADV)
    maandag: Union[float, str] = 0
    dinsdag: Union[float, str] = 0
    woensdag: Union[float, str] = 0
    donderdag: Union[float, str] = 0
    vrijdag: Union[float, str] = 0
    zaterdag: Union[float, str] = 0
    zondag: Union[float, str] = 0
    # Afkortingen per dag (Z, V, BV, BF of leeg) - kept for backward compatibility
    afkorting_ma: str = ""
    afkorting_di: str = ""
    afkorting_wo: str = ""
    afkorting_do: str = ""
    afkorting_vr: str = ""
    afkorting_za: str = ""
    afkorting_zo: str = ""
    
    def __init__(self, **data):
        # Handle old records that use 'naam' instead of 'teamlid_naam'
        if not data.get('teamlid_naam') and data.get('naam'):
            data['teamlid_naam'] = data['naam']
        super().__init__(**data)

class KmRegel(BaseModel):
    maandag: float = 0
    dinsdag: float = 0
    woensdag: float = 0
    donderdag: float = 0
    vrijdag: float = 0
    zaterdag: float = 0
    zondag: float = 0

class Werkbon(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    week_nummer: int
    jaar: int
    # Auto-generated dates based on week number
    datum_maandag: Optional[str] = None
    datum_dinsdag: Optional[str] = None
    datum_woensdag: Optional[str] = None
    datum_donderdag: Optional[str] = None
    datum_vrijdag: Optional[str] = None
    datum_zaterdag: Optional[str] = None
    datum_zondag: Optional[str] = None
    
    klant_id: Optional[str] = None  # Made optional for old records
    klant_naam: str = ""
    werf_id: Optional[str] = None  # Made optional for old records
    werf_naam: str = ""
    
    uren: List[UrenRegel] = []  # Made optional with default
    km_afstand: KmRegel = Field(default_factory=KmRegel)
    
    # New fields
    uitgevoerde_werken: str = ""  # Work description
    extra_materialen: str = ""  # Extra materials used
    
    handtekening_data: Optional[str] = None
    handtekening_naam: str = ""
    handtekening_datum: Optional[datetime] = None
    selfie_data: Optional[str] = None
    
    ingevuld_door_id: str
    ingevuld_door_naam: str

    status: str = "concept"  # concept, ondertekend, verzonden
    email_verzonden: bool = False
    toegewezen_aan: List[str] = []  # User IDs of assigned team members
    planning_id: Optional[str] = None
    groep_id: Optional[str] = None  # Optional link to WerkbonGroep (monthly bundle)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# ── WerkbonGroep ──────────────────────────────────────────────────────────────
# Bundles multiple weekly Werkbon records (one per ISO week) into a single
# multi-week deliverable: ONE combined PDF, ONE klant signature, ONE email.
# Child werkbonnen keep their existing weekly shape so per-week views, exports,
# Billit, etc. all keep working.
class WerkbonGroep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"

    # Periode covered by this groep (inclusive, ISO YYYY-MM-DD)
    periode_van: str
    periode_tot: str

    # Linked child werkbonnen (ordered jaar/week_nummer)
    werkbon_ids: List[str] = []

    # Resolved klant/werf for the whole groep — all children share these
    klant_id: str
    klant_naam: str = ""
    werf_id: str
    werf_naam: str = ""

    # Single signature spans every week
    handtekening_data: Optional[str] = None
    handtekening_naam: str = ""
    handtekening_datum: Optional[datetime] = None
    selfie_data: Optional[str] = None

    ingevuld_door_id: str
    ingevuld_door_naam: str = ""

    status: str = "concept"  # concept, ondertekend, verzonden
    email_verzonden: bool = False
    email_error: Optional[str] = None
    pdf_bestandsnaam: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WerkbonGroepUpdate(BaseModel):
    handtekening_data: Optional[str] = None
    handtekening_naam: Optional[str] = None
    selfie_data: Optional[str] = None
    status: Optional[str] = None


class WerkbonCreate(BaseModel):
    week_nummer: int
    jaar: int
    klant_id: str
    werf_id: str
    uren: List[UrenRegel]
    km_afstand: Optional[KmRegel] = None
    uitgevoerde_werken: str = ""
    extra_materialen: str = ""
    planning_id: Optional[str] = None

class WerkbonUpdate(BaseModel):
    week_nummer: Optional[int] = None
    jaar: Optional[int] = None
    klant_id: Optional[str] = None
    klant_naam: Optional[str] = None
    werf_id: Optional[str] = None
    werf_naam: Optional[str] = None
    uren: Optional[List[UrenRegel]] = None
    km_afstand: Optional[KmRegel] = None
    uitgevoerde_werken: Optional[str] = None
    extra_materialen: Optional[str] = None
    handtekening_data: Optional[str] = None
    handtekening_naam: Optional[str] = None
    selfie_data: Optional[str] = None
    status: Optional[str] = None

# Bedrijfsinstellingen (Company Settings)
class BedrijfsInstellingen(BaseModel):
    """Legacy model - maintained for backward compatibility.
    New code should use CompanySettings model."""
    id: str = "company_settings"
    company_id: str = "default_company"       # NEW: Company scoping
    
    bedrijfsnaam: str = "Signybon"
    voornaam: Optional[str] = None
    achternaam: Optional[str] = None
    email: str = ""
    admin_emails: List[str] = []  # Admin email addresses
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    kvk_nummer: Optional[str] = None
    btw_nummer: Optional[str] = None
    website: Optional[str] = None             # NEW
    
    # PDF Settings
    logo_base64: Optional[str] = None  # Company logo for PDF (legacy)
    pdf_voettekst: str = "Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week."
    uren_confirmation_text: str = "Hierbij bevestigt de klant dat deze ingevulde werkbon juist is ingevuld."
    oplevering_confirmation_text: str = "Hierbij bevestigt de klant dat deze ingevulde oplevering bon juist is ingevuld."
    project_confirmation_text: str = "Hierbij bevestigt de klant dat deze ingevulde project werkbon juist is ingevuld."
    
    # Feature toggles
    selfie_activeren: bool = False
    sms_verificatie_activeren: bool = False
    automatisch_naar_klant: bool = False  # Auto-include client email in werkbon email
    
    # Theme settings for remote control
    primary_color: str = "#1a1a2e"
    secondary_color: str = "#F5A623"
    accent_color: str = "#16213e"

    # Werkbon PDF colors — separate from web branding
    werkbon_primary_color: str = "#E8A020"
    werkbon_secondary_color: str = "#1a1a2e"
    werkbon_accent_color: str = "#F5A623"

    ondernemingsnummer: Optional[str] = None  # Belgian enterprise number

    # === NEW STRUCTURED FIELDS (Phase 1) ===
    adres_gestructureerd: Optional[Dict] = None
    emails: Optional[Dict] = None
    branding: Optional[Dict] = None
    pdf_teksten: Optional[Dict] = None

    # === FACTURATIE KOPPELING ===
    billit_api_key: Optional[str] = None
    billit_party_id: Optional[int] = None
    billit_omschrijving_template: str = "Werkzaamheden week {week} - {werf}"
    billit_referentie_veld: str = "Reference"          # "Reference" or "OrderTitle"
    billit_actief: bool = False
    billit_auto_versturen: bool = False

class BedrijfsInstellingenUpdate(BaseModel):
    bedrijfsnaam: Optional[str] = None
    voornaam: Optional[str] = None
    achternaam: Optional[str] = None
    email: Optional[str] = None
    werkbon_email: Optional[str] = None       # NEW: separate werkbon email
    admin_emails: Optional[List[str]] = None
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    kvk_nummer: Optional[str] = None
    btw_nummer: Optional[str] = None
    ondernemingsnummer: Optional[str] = None  # NEW: Belgian enterprise number
    website: Optional[str] = None             # NEW
    logo_base64: Optional[str] = None
    pdf_voettekst: Optional[str] = None
    uren_confirmation_text: Optional[str] = None
    oplevering_confirmation_text: Optional[str] = None
    project_confirmation_text: Optional[str] = None
    selfie_activeren: Optional[bool] = None
    sms_verificatie_activeren: Optional[bool] = None
    automatisch_naar_klant: Optional[bool] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    # Werkbon PDF colors — separate from web branding
    werkbon_primary_color: Optional[str] = None
    werkbon_secondary_color: Optional[str] = None
    werkbon_accent_color: Optional[str] = None
    # NEW structured fields - support both naming conventions
    adres_gestructureerd: Optional[Dict] = None
    adres_structured: Optional[Dict] = None    # Frontend sends this
    emails: Optional[Dict] = None
    branding: Optional[Dict] = None
    pdf_teksten: Optional[Dict] = None
    pdf_texts: Optional[Dict] = None           # Frontend sends this
    # Facturatie koppeling
    billit_api_key: Optional[str] = None
    billit_party_id: Optional[int] = None
    billit_omschrijving_template: Optional[str] = None
    billit_referentie_veld: Optional[str] = None
    billit_actief: Optional[bool] = None
    billit_auto_versturen: Optional[bool] = None

# ==================== OPLEVERING WERKBON (Customer Satisfaction) ====================

class SchadeCheck(BaseModel):
    label: str  # e.g. "Geen schade aan eigendom klant"
    checked: bool = False
    opmerking: str = ""
    foto: Optional[str] = None  # base64 photo if damage found

class Beoordeling(BaseModel):
    categorie: str  # e.g. "Kwaliteit van het werk"
    score: int = 0  # 1-5 stars
    opmerking: str = ""

class OpleveringWerkbon(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    type: str = "oplevering"
    
    # Klant & Werf info
    klant_id: str
    klant_naam: str
    klant_email: Optional[str] = None
    klant_telefoon: Optional[str] = None
    werf_id: str
    werf_naam: str
    werf_adres: Optional[str] = None
    
    # Werk details
    datum: str  # Date of delivery
    werk_beschrijving: str = ""  # What was done
    installatie_type: str = ""  # Zonnepaneel, Airco, etc.
    gebruikte_materialen: str = ""
    extra_opmerkingen: str = ""
    schade_status: str = "geen_schade"  # geen_schade, schade_aanwezig
    schade_opmerking: str = ""
    
    # Schade checks (CRITICAL)
    schade_checks: List[SchadeCheck] = Field(default_factory=lambda: [
        SchadeCheck(label="Geen schade aan eigendom klant"),
        SchadeCheck(label="Alle apparatuur werkt correct"),
        SchadeCheck(label="Werkplek schoon opgeleverd"),
        SchadeCheck(label="Alle afval afgevoerd"),
    ])
    alles_ok: bool = False  # Master toggle - everything OK
    
    # Star ratings
    beoordelingen: List[Beoordeling] = Field(default_factory=lambda: [
        Beoordeling(categorie="Kwaliteit van het werk"),
        Beoordeling(categorie="Communicatie met monteurs"),
        Beoordeling(categorie="Stiptheid / Punctualiteit"),
        Beoordeling(categorie="Netheid en orde"),
        Beoordeling(categorie="Algehele tevredenheid"),
    ])
    
    # Photos (before/after + work photos)
    fotos: List[str] = []  # List of base64 encoded images
    foto_labels: List[str] = []  # Label for each photo
    
    # Signatures & Page 2
    handtekening_klant: Optional[str] = None  # Client signature base64
    handtekening_klant_naam: str = ""
    handtekening_monteur: Optional[str] = None  # Technician signature base64
    handtekening_monteur_naam: str = ""
    handtekening_datum: Optional[datetime] = None
    selfie_foto: Optional[str] = None
    gps_locatie: Optional[str] = None
    verstuur_naar_klant: bool = False
    klant_email_override: Optional[str] = None
    email_error: Optional[str] = None
    pdf_bestandsnaam: Optional[str] = None
    
    # KM afstand heen & terug (per dag)
    km_afstand: Optional[dict] = None  # {maandag: x, dinsdag: x, ...}

    # Meta
    ingevuld_door_id: str
    ingevuld_door_naam: str
    status: str = "concept"  # concept, ondertekend, verzonden
    email_verzonden: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class OpleveringWerkbonCreate(BaseModel):
    klant_id: str
    werf_id: str
    datum: str
    installatie_type: str = ""
    werk_beschrijving: str = ""
    gebruikte_materialen: str = ""
    extra_opmerkingen: str = ""
    schade_status: str = "geen_schade"
    schade_opmerking: str = ""
    schade_checks: List[SchadeCheck] = Field(default_factory=list)
    alles_ok: bool = False
    beoordelingen: List[Beoordeling] = Field(default_factory=list)
    fotos: List[str] = Field(default_factory=list)
    foto_labels: List[str] = Field(default_factory=list)
    handtekening_klant: Optional[str] = None
    handtekening_klant_naam: str = ""
    handtekening_monteur: Optional[str] = None
    handtekening_monteur_naam: str = ""
    selfie_foto: Optional[str] = None
    gps_locatie: Optional[str] = None
    handtekening_datum_str: Optional[str] = None
    verstuur_naar_klant: bool = False
    klant_email_override: Optional[str] = None

class OpleveringWerkbonUpdate(BaseModel):
    datum: Optional[str] = None
    werk_beschrijving: Optional[str] = None
    installatie_type: Optional[str] = None
    gebruikte_materialen: Optional[str] = None
    extra_opmerkingen: Optional[str] = None
    schade_status: Optional[str] = None
    schade_opmerking: Optional[str] = None
    schade_checks: Optional[List[SchadeCheck]] = None
    alles_ok: Optional[bool] = None
    beoordelingen: Optional[List[Beoordeling]] = None
    fotos: Optional[List[str]] = None
    foto_labels: Optional[List[str]] = None
    handtekening_klant: Optional[str] = None
    handtekening_klant_naam: Optional[str] = None
    handtekening_monteur: Optional[str] = None
    handtekening_monteur_naam: Optional[str] = None
    selfie_foto: Optional[str] = None
    gps_locatie: Optional[str] = None
    verstuur_naar_klant: Optional[bool] = None
    klant_email_override: Optional[str] = None
    status: Optional[str] = None

# ==================== PROJECT WERKBON (Project Manager) ====================

class ProjectWerkbon(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    type: str = "project"
    
    # Klant & Werf info
    klant_id: str
    klant_naam: str
    werf_id: str
    werf_naam: str
    werf_adres: Optional[str] = None
    
    # Time tracking
    datum: str
    start_tijd: str = ""  # legacy
    stop_tijd: str = ""  # legacy
    pauze_minuten: int = 0
    totaal_uren: float = 0
    dag_regels: List[dict] = Field(default_factory=list)
    
    # Location
    locatie_start: Optional[str] = None  # GPS coords or address
    locatie_stop: Optional[str] = None
    
    # Work details
    werk_beschrijving: str = ""
    extra_opmerkingen: str = ""
    klant_feedback_items: List[dict] = Field(default_factory=list)
    klant_feedback_opmerking: str = ""
    klant_prestatie_score: int = 0
    klant_email_override: Optional[str] = None
    verstuur_naar_klant: bool = False
    pdf_bestandsnaam: Optional[str] = None
    email_error: Optional[str] = None
    
    # Signatures
    handtekening_klant: Optional[str] = None
    handtekening_klant_naam: str = ""
    handtekening_monteur: Optional[str] = None
    handtekening_monteur_naam: str = ""
    handtekening_datum: Optional[datetime] = None
    
    # KM afstand heen & terug (per dag)
    km_afstand: Optional[dict] = None  # {maandag: x, dinsdag: x, ...}

    # Meta
    ingevuld_door_id: str
    ingevuld_door_naam: str
    status: str = "concept"
    email_verzonden: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectWerkbonCreate(BaseModel):
    klant_id: str
    werf_id: str
    datum: str
    start_tijd: str = ""
    stop_tijd: str = ""
    pauze_minuten: int = 0
    werk_beschrijving: str = ""
    extra_opmerkingen: str = ""
    dag_regels: List[dict] = Field(default_factory=list)
    klant_feedback_items: List[dict] = Field(default_factory=list)
    klant_feedback_opmerking: str = ""
    klant_prestatie_score: int = 0
    handtekening_klant: Optional[str] = None
    handtekening_klant_naam: str = ""
    handtekening_monteur_naam: str = ""
    verstuur_naar_klant: bool = False
    klant_email_override: Optional[str] = None

class ProjectWerkbonUpdate(BaseModel):
    datum: Optional[str] = None
    start_tijd: Optional[str] = None
    stop_tijd: Optional[str] = None
    pauze_minuten: Optional[int] = None
    dag_regels: Optional[List[dict]] = None
    locatie_start: Optional[str] = None
    locatie_stop: Optional[str] = None
    werk_beschrijving: Optional[str] = None
    extra_opmerkingen: Optional[str] = None
    klant_feedback_items: Optional[List[dict]] = None
    klant_feedback_opmerking: Optional[str] = None
    klant_prestatie_score: Optional[int] = None
    handtekening_klant: Optional[str] = None
    handtekening_klant_naam: Optional[str] = None
    handtekening_monteur: Optional[str] = None
    handtekening_monteur_naam: Optional[str] = None
    verstuur_naar_klant: Optional[bool] = None
    klant_email_override: Optional[str] = None
    status: Optional[str] = None

# ==================== PRODUCTIE WERKBON (PUR Insulation) ====================

class ProductieFoto(BaseModel):
    base64: str = ""
    timestamp: str = ""
    werknemer_id: str = ""
    gps: str = ""

class ProductieWerkbon(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    type: str = "productie"
    datum: str
    werknemer_naam: str = ""
    werknemer_id: str = ""
    klant_id: str
    klant_naam: str
    werf_id: str
    werf_naam: str
    werf_adres: Optional[str] = None
    start_uur: str = ""
    eind_uur: str = ""
    voorziene_uur: str = ""
    uit_te_voeren_werk: str = ""
    nodige_materiaal: str = ""
    gelijkvloers_m2: float = 0
    gelijkvloers_cm: float = 0
    eerste_verdiep_m2: float = 0
    eerste_verdiep_cm: float = 0
    tweede_verdiep_m2: float = 0
    tweede_verdiep_cm: float = 0
    totaal_m2: float = 0
    schuurwerken: bool = False
    schuurwerken_m2: float = 0
    stofzuigen: bool = False
    stofzuigen_m2: float = 0
    fotos: List[dict] = Field(default_factory=list)
    opmerking: str = ""
    gps_locatie: Optional[str] = None
    handtekening: Optional[str] = None
    handtekening_naam: str = ""
    handtekening_datum: Optional[str] = None
    selfie_foto: Optional[str] = None
    verstuur_naar_klant: bool = False
    klant_email_override: Optional[str] = None
    km_afstand: Optional[dict] = None  # {maandag: x, dinsdag: x, ...}
    ingevuld_door_id: str
    ingevuld_door_naam: str
    status: str = "concept"
    email_verzonden: bool = False
    pdf_bestandsnaam: Optional[str] = None
    email_error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProductieWerkbonCreate(BaseModel):
    datum: str
    werknemer_naam: str = ""
    werknemer_id: str = ""
    klant_id: Optional[str] = None
    klant_naam: Optional[str] = None
    werf_id: Optional[str] = None
    werf_naam: Optional[str] = None
    werf_adres: Optional[str] = None
    start_uur: str = ""
    eind_uur: str = ""
    voorziene_uur: str = ""
    uit_te_voeren_werk: str = ""
    nodige_materiaal: str = ""
    
    # Legacy fields (for backward compatibility)
    gelijkvloers_m2: float = 0
    gelijkvloers_cm: float = 0
    eerste_verdiep_m2: float = 0
    eerste_verdiep_cm: float = 0
    tweede_verdiep_m2: float = 0
    tweede_verdiep_cm: float = 0
    schuurwerken: bool = False
    schuurwerken_m2: float = 0
    stofzuigen: bool = False
    stofzuigen_m2: float = 0
    
    # New structure: Multiple products with floors and extra work
    producten: Optional[List[dict]] = None  # List of products with verdiepingen and extra_werken
    totaal_m2: Optional[float] = None  # Total m² across all products
    
    fotos: List[dict] = Field(default_factory=list)
    opmerking: str = ""
    gps_locatie: Optional[str] = None
    handtekening: Optional[str] = None
    handtekening_naam: str = ""
    handtekening_datum: Optional[str] = None
    selfie_foto: Optional[str] = None
    verstuur_naar_klant: bool = False
    klant_email_override: Optional[str] = None
    ingevuld_door_id: Optional[str] = None
    ingevuld_door_naam: Optional[str] = None
    status: str = "concept"

# ==================== PLANNING SYSTEM ====================

class PlanningItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    week_nummer: int
    jaar: int
    dag: str  # maandag, dinsdag, etc.
    datum: str  # DD-MM-YYYY
    
    # Time fields
    start_uur: Optional[str] = ""   # e.g. "08:00"
    eind_uur: Optional[str] = ""    # e.g. "16:30"
    voorziene_uur: Optional[str] = ""  # e.g. "8 uur" — auto-calc or manual
    
    # Assignment
    werknemer_ids: List[str] = []
    werknemer_namen: List[str] = []
    team_id: Optional[str] = None
    team_naam: Optional[str] = None
    
    # Job details
    klant_id: str
    klant_naam: str
    werf_id: str
    werf_naam: str
    werf_adres: Optional[str] = None
    
    # Work instructions
    omschrijving: str = ""            # Uit te voeren werk (main job instruction)
    materiaallijst: List[str] = []    # Required materials (list of items)
    nodige_materiaal: str = ""        # Materials as free text (multiline, mirrors materiaallijst)
    opmerking_aandachtspunt: str = "" # Special notes, risks, warnings, client instructions
    geschatte_duur: str = ""          # Estimated duration (kept for compatibility)
    prioriteit: str = "normaal"       # laag, normaal, hoog, urgent
    belangrijk: bool = False          # Admin can mark as important
    
    # Status (admin panel only)
    status: str = "gepland"  # gepland, onderweg, bezig, afgerond
    
    # Worker acknowledgment
    bevestigd_door: List[str] = []  # Worker IDs who pressed OK
    bevestigingen: List[dict] = Field(default_factory=list)  # [{worker_id, worker_naam, timestamp}]
    
    notities: str = ""  # Additional notes
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PlanningItemCreate(BaseModel):
    week_nummer: int
    jaar: int
    dag: str
    datum: str
    start_uur: Optional[str] = ""
    eind_uur: Optional[str] = ""
    voorziene_uur: Optional[str] = ""
    werknemer_ids: List[str] = []
    werknemer_namen: List[str] = []
    team_id: Optional[str] = None
    klant_id: str
    werf_id: str
    omschrijving: str = ""
    materiaallijst: List[str] = []
    nodige_materiaal: str = ""
    opmerking_aandachtspunt: str = ""
    geschatte_duur: str = ""
    prioriteit: str = "normaal"
    belangrijk: bool = False
    notities: str = ""

class PlanningItemUpdate(BaseModel):
    dag: Optional[str] = None
    datum: Optional[str] = None
    start_uur: Optional[str] = None
    eind_uur: Optional[str] = None
    voorziene_uur: Optional[str] = None
    werknemer_ids: Optional[List[str]] = None
    werknemer_namen: Optional[List[str]] = None
    team_id: Optional[str] = None
    klant_id: Optional[str] = None
    werf_id: Optional[str] = None
    omschrijving: Optional[str] = None
    materiaallijst: Optional[List[str]] = None
    nodige_materiaal: Optional[str] = None
    opmerking_aandachtspunt: Optional[str] = None
    geschatte_duur: Optional[str] = None
    prioriteit: Optional[str] = None
    belangrijk: Optional[bool] = None
    status: Optional[str] = None
    notities: Optional[str] = None

class PlanningBulkCreate(BaseModel):
    week_nummer: int
    jaar: int
    dagen: List[str]
    datums: Dict[str, str] = {}
    start_uur: Optional[str] = ""
    eind_uur: Optional[str] = ""
    voorziene_uur: Optional[str] = ""
    werknemer_ids: List[str] = []
    werknemer_namen: List[str] = []
    team_id: Optional[str] = None
    klant_id: str
    werf_id: str
    omschrijving: str = ""
    materiaallijst: List[str] = []
    nodige_materiaal: str = ""
    opmerking_aandachtspunt: str = ""
    geschatte_duur: str = ""
    prioriteit: str = "normaal"
    belangrijk: bool = False
    notities: str = ""


# Multi-week planning create — the backend slices the date range into ISO weeks,
# creates planning items per day, and stitches them under a single WerkbonGroep.
class PlanningMaandBulkCreate(BaseModel):
    van_datum: str   # YYYY-MM-DD, inclusive
    tot_datum: str   # YYYY-MM-DD, inclusive
    start_uur: Optional[str] = ""
    eind_uur: Optional[str] = ""
    voorziene_uur: Optional[str] = ""
    werknemer_ids: List[str] = []
    werknemer_namen: List[str] = []
    team_id: Optional[str] = None
    klant_id: str
    werf_id: str
    omschrijving: str = ""
    materiaallijst: List[str] = []
    nodige_materiaal: str = ""
    opmerking_aandachtspunt: str = ""
    geschatte_duur: str = ""
    prioriteit: str = "normaal"
    belangrijk: bool = False
    notities: str = ""
    # Optional: skip weekend days (default keeps them in if the range includes
    # a Saturday/Sunday — the worker may still need to be scheduled).
    skip_weekend: bool = False

# ==================== MESSAGES / BERICHTEN ====================

class BerichtAttachment(BaseModel):
    naam: str
    type: str
    data: str

class Bericht(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = "default_company"       # NEW: Company scoping
    van_id: str  # Sender user ID
    van_naam: str
    naar_id: Optional[str] = None  # Recipient user ID (None = all workers)
    naar_naam: Optional[str] = None
    is_broadcast: bool = False  # Send to all workers
    
    onderwerp: str = ""
    inhoud: str = ""
    
    vastgepind: bool = False  # Pinned message
    gelezen_door: List[str] = []  # User IDs who read it
    
    bijlagen: List[BerichtAttachment] = []  # Attachments
    
    planning_id: Optional[str] = None  # Linked planning item
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BerichtCreate(BaseModel):
    naar_id: Optional[str] = None
    is_broadcast: bool = False
    onderwerp: str = ""
    inhoud: str = ""
    vastgepind: bool = False
    planning_id: Optional[str] = None
    bijlagen: List[BerichtAttachment] = []

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def generate_temp_password(length: int = 10) -> str:
    return uuid.uuid4().hex[:length]

async def prepare_werkbon_for_pdf(werkbon: dict) -> dict:
    """
    Prepare werkbon data for PDF generation by resolving GridFS file IDs to base64 data.
    This converts GridFS references back to base64 for the PDF generator.
    """
    werkbon_copy = dict(werkbon)
    
    # Process fotos - convert file_ids back to base64 for PDF
    if werkbon_copy.get("fotos"):
        processed_fotos = []
        for foto in werkbon_copy["fotos"]:
            if isinstance(foto, dict) and foto.get("file_id"):
                # It's a GridFS reference (productie werkbon format)
                base64_data = await get_file_as_base64(foto["file_id"])
                if base64_data:
                    processed_fotos.append({
                        "base64": base64_data,
                        "timestamp": foto.get("timestamp", ""),
                        "werknemer_id": foto.get("werknemer_id", ""),
                        "gps": foto.get("gps", ""),
                    })
            elif isinstance(foto, dict) and foto.get("base64"):
                # Already has base64 (legacy format)
                processed_fotos.append(foto)
            elif isinstance(foto, str) and is_gridfs_id(foto):
                # Oplevering format - just file_id string
                base64_data = await get_file_as_base64(foto)
                if base64_data:
                    processed_fotos.append(base64_data)  # Keep as string for oplevering compatibility
            elif isinstance(foto, str):
                # Old format - just base64 string
                processed_fotos.append(foto)
        werkbon_copy["fotos"] = processed_fotos
    
    # Process handtekening - convert file_id to base64
    if werkbon_copy.get("handtekening") and is_gridfs_id(str(werkbon_copy.get("handtekening", ""))):
        base64_data = await get_file_as_base64(werkbon_copy["handtekening"])
        werkbon_copy["handtekening"] = base64_data
    
    # Process handtekening_klant - convert file_id to base64
    if werkbon_copy.get("handtekening_klant") and is_gridfs_id(str(werkbon_copy.get("handtekening_klant", ""))):
        base64_data = await get_file_as_base64(werkbon_copy["handtekening_klant"])
        werkbon_copy["handtekening_klant"] = base64_data
    
    # Process handtekening_monteur - convert file_id to base64
    if werkbon_copy.get("handtekening_monteur") and is_gridfs_id(str(werkbon_copy.get("handtekening_monteur", ""))):
        base64_data = await get_file_as_base64(werkbon_copy["handtekening_monteur"])
        werkbon_copy["handtekening_monteur"] = base64_data
    
    # Process selfie_foto - convert file_id to base64
    if werkbon_copy.get("selfie_foto") and is_gridfs_id(str(werkbon_copy.get("selfie_foto", ""))):
        base64_data = await get_file_as_base64(werkbon_copy["selfie_foto"])
        werkbon_copy["selfie_foto"] = base64_data
    
    return werkbon_copy

def get_week_dates(year: int, week: int) -> dict:
    """Calculate dates for each day of the given week"""
    # Find the first day of the year
    jan1 = datetime(year, 1, 1)
    # Find the first Monday of the year
    days_to_monday = (7 - jan1.weekday()) % 7
    if jan1.weekday() <= 3:  # If Jan 1 is Mon-Thu, week 1 starts that week
        first_monday = jan1 - timedelta(days=jan1.weekday())
    else:  # Otherwise week 1 starts next Monday
        first_monday = jan1 + timedelta(days=days_to_monday)
    
    # Calculate the Monday of the requested week
    week_monday = first_monday + timedelta(weeks=week - 1)
    
    return {
        "datum_maandag": week_monday.strftime("%d-%m"),
        "datum_dinsdag": (week_monday + timedelta(days=1)).strftime("%d-%m"),
        "datum_woensdag": (week_monday + timedelta(days=2)).strftime("%d-%m"),
        "datum_donderdag": (week_monday + timedelta(days=3)).strftime("%d-%m"),
        "datum_vrijdag": (week_monday + timedelta(days=4)).strftime("%d-%m"),
        "datum_zaterdag": (week_monday + timedelta(days=5)).strftime("%d-%m"),
        "datum_zondag": (week_monday + timedelta(days=6)).strftime("%d-%m"),
    }

async def is_admin(email: str) -> bool:
    """Check if user has admin role (role-based, not email-based)."""
    user = await db.users.find_one({"email": email.lower()})
    if not user:
        return False
    role = (user.get("rol") or "").lower()
    return role in ("admin", "master_admin")

# ==================== AUTH ROUTES ====================

async def send_welcome_email(user_email: str, user_naam: str, temp_password: str, instellingen: dict):
    """Send welcome email directly to the new worker."""
    
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping welcome email")
        return {"success": False, "error": "Email not configured"}
    
    bedrijfsnaam = get_email_brand_name(instellingen)
    
    sender_email = os.environ.get("SENDER_EMAIL") or instellingen.get("email") or COMPANY_EMAIL
    sender = sender_email if "<" in sender_email else f"{bedrijfsnaam} <{sender_email}>"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }}
            .header {{ background: #1a1a2e; color: white; padding: 30px; text-align: center; }}
            .header h1 {{ color: #F5A623; margin: 0; }}
            .content {{ padding: 30px; }}
            .credentials {{ background: #f8f9fa; border-left: 4px solid #F5A623; padding: 20px; margin: 20px 0; }}
            .credentials strong {{ color: #F5A623; }}
            .steps {{ background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .steps h3 {{ color: #856404; margin-top: 0; }}
            .step {{ margin: 12px 0; padding-left: 20px; }}
            .footer {{ background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>{bedrijfsnaam}</h1>
            <p>Nieuwe Werknemer Aangemaakt</p>
        </div>
        
        <div class="content">
            <h2>Nieuwe werknemer: {user_naam}</h2>
            
            <p>Er is een nieuw account aangemaakt in het werkbon systeem.</p>
            
            <div class="credentials">
                <h3>Inloggegevens voor {user_naam}</h3>
                <p><strong>E-mail:</strong> {user_email}</p>
                <p><strong>Tijdelijk wachtwoord:</strong> {temp_password}</p>
            </div>
            
            <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="color: #F5A623; font-weight: bold; margin: 0 0 10px 0;">📱 Smart-TS App</p>
                <p style="color: #aaa; margin: 0 0 15px 0;">Open de link hieronder op je telefoon en voeg toe aan het beginscherm</p>
                <a href="{APP_URL}" style="background: #F5A623; color: #1a1a2e; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                    🔗 Open Smart-TS App
                </a>
                <p style="color: #666; font-size: 11px; margin: 10px 0 0 0;">Tip: In je browser → "Toevoegen aan beginscherm" voor een app-pictogram</p>
            </div>
            
            <div class="steps">
                <h3>Instructies voor de werknemer:</h3>
                <div class="step">1. Open de Werkbon app en log in met bovenstaande e-mailadres en tijdelijk wachtwoord.</div>
                <div class="step">2. Ga naar <strong>Werkbonnen</strong> en klik op <strong>+</strong> om een nieuwe werkbon aan te maken.</div>
                <div class="step">3. Controleer eerst het <strong>weeknummer</strong>. Selecteer daarna de juiste <strong>klant</strong> en <strong>werf</strong>.</div>
                <div class="step">4. Vul per dag de <strong>effectief gewerkte uren</strong> in. Gebruik indien nodig de afkortingen Z, V, BV of BF.</div>
                <div class="step">5. Voeg een <strong>korte beschrijving van de uitgevoerde werken</strong> toe en noteer ook eventuele <strong>extra gebruikte materialen</strong>.</div>
                <div class="step">6. Vul de dagelijkse <strong>KM-afstand</strong> in voor het woon-werkverkeer of de gereden verplaatsingen indien van toepassing.</div>
                <div class="step">7. Ga daarna naar <strong>Ondertekenen</strong> en laat de verantwoordelijke werfleider of contactpersoon op de werf de werkbon ondertekenen en zijn/haar naam invullen.</div>
                <div class="step">8. Controleer alles nog één keer en klik vervolgens op <strong>Versturen als PDF</strong> om de werkbon te verzenden.</div>
            </div>
        </div>
        
        <div class="footer">
            <p>Dit is een automatisch gegenereerd bericht van {bedrijfsnaam}.</p>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": sender,
            "to": [user_email],
            "subject": f"Nieuwe Werknemer: {user_naam} - Inloggegevens",
            "html": html_content,
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
        }

        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Welcome email sent to worker {user_email}: {result}")
        return {"success": True, "email_id": result.get("id")}
    except Exception as e:
        logging.error(f"Failed to send welcome email: {str(e)}")
        return {"success": False, "error": str(e)}


async def send_klant_welcome_email(klant_email: str, klant_naam: str, instellingen: dict):
    """Send professional welcome email to a new client."""
    
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping client email")
        return {"success": False, "error": "Email not configured"}
    
    bedrijfsnaam = get_email_brand_name(instellingen)
    logo_base64 = instellingen.get("logo_base64", "")
    primary_color = instellingen.get("primary_color", "#1a1a2e")
    secondary_color = instellingen.get("secondary_color", "#F5A623")
    telefoon = instellingen.get("telefoon", "")
    email_bedrijf = instellingen.get("email", "")
    
    sender_email = os.environ.get("SENDER_EMAIL") or email_bedrijf or COMPANY_EMAIL
    sender = sender_email if "<" in sender_email else f"{bedrijfsnaam} <{sender_email}>"
    
    logo_html = ""
    if logo_base64:
        logo_html = f'<img src="data:image/png;base64,{logo_base64}" style="max-height:60px;margin-bottom:10px;" alt="{bedrijfsnaam}">'
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
        <div style="background: {primary_color}; color: white; padding: 35px; text-align: center; border-radius: 12px 12px 0 0;">
            {logo_html}
            <h1 style="color: {secondary_color}; margin: 0; font-size: 24px;">{bedrijfsnaam}</h1>
        </div>
        
        <div style="background: white; padding: 35px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h2 style="color: {primary_color}; margin-top: 0;">Beste {klant_naam},</h2>
            
            <p>Welkom bij het digitale werkbonportaal van <strong>{bedrijfsnaam}</strong>.</p>
            
            <p>Wij zijn verheugd u te mogen informeren dat u bent toegevoegd aan ons digitale werkbonsysteem. 
            Vanaf heden ontvangt u automatisch de getekende werkbonnen digitaal via e-mail na afronding van werkzaamheden.</p>
            
            <div style="background: #f8f9fa; border-left: 4px solid {secondary_color}; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <h3 style="color: {primary_color}; margin-top: 0;">Wat kunt u verwachten?</h3>
                <ul style="margin: 0; padding-left: 20px;">
                    <li>Digitale werkbonnen per e-mail na ondertekening</li>
                    <li>Overzichtelijke PDF-documenten met alle werkdetails</li>
                    <li>Professionele rapportage van uitgevoerde werkzaamheden</li>
                </ul>
            </div>
            
            <p>Indien u vragen heeft over het systeem of aanpassingen wenst, neem dan gerust contact met ons op.</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background: {primary_color}; padding: 20px 30px; border-radius: 10px;">
                    <p style="color: {secondary_color}; font-weight: bold; margin: 0 0 5px 0; font-size: 16px;">Contact</p>
                    <p style="color: white; margin: 0;">{email_bedrijf}</p>
                    {"<p style='color: white; margin: 5px 0 0 0;'>" + telefoon + "</p>" if telefoon else ""}
                </div>
            </div>
            
            <p style="color: #666; font-size: 13px;">Met vriendelijke groet,<br><strong>{bedrijfsnaam}</strong></p>
        </div>
        
        <div style="text-align: center; padding: 15px; font-size: 11px; color: #999;">
            <p>Dit is een automatisch gegenereerd bericht van {bedrijfsnaam}.</p>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": sender,
            "to": [klant_email],
            "subject": f"Welkom bij het werkbonportaal van {bedrijfsnaam}",
            "html": html_content,
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Client welcome email sent to {klant_email}: {result}")
        return {"success": True, "email_id": result.get("id")}
    except Exception as e:
        logging.error(f"Failed to send client welcome email: {str(e)}")
        return {"success": False, "error": str(e)}


DAY_COLUMNS = [
    ("maandag", "Ma", "datum_maandag", "afkorting_ma"),
    ("dinsdag", "Di", "datum_dinsdag", "afkorting_di"),
    ("woensdag", "Wo", "datum_woensdag", "afkorting_wo"),
    ("donderdag", "Do", "datum_donderdag", "afkorting_do"),
    ("vrijdag", "Vr", "datum_vrijdag", "afkorting_vr"),
    ("zaterdag", "Za", "datum_zaterdag", "afkorting_za"),
    ("zondag", "Zo", "datum_zondag", "afkorting_zo"),
]


def get_sender_email(instellingen: dict) -> str:
    """Always send from verified Signybon domain, but use company name as display name."""
    bedrijfsnaam = get_email_brand_name(instellingen)
    sender_email = os.environ.get("SENDER_EMAIL", "noreply@signybon.com")
    return f"{bedrijfsnaam} <{sender_email}>"

def get_reply_to(instellingen: dict, user_email: Optional[str] = None) -> Optional[str]:
    """Return the address that replies should land in. Priority:
      1. instellingen.email (the company's own inbox)
      2. user_email (the logged-in user — so replies still reach a real person
         instead of vanishing into the Signybon noreply mailbox).
    Never falls back to a Signybon platform address — that would route a
    tenant's client replies to the wrong inbox."""
    inst_email = (instellingen.get("email") or "").strip()
    if inst_email:
        return inst_email
    if user_email and user_email.strip():
        return user_email.strip()
    return None


def get_email_brand_name(instellingen: dict) -> str:
    bedrijfsnaam = (instellingen.get("bedrijfsnaam") or "Signybon").strip()
    lowered = bedrijfsnaam.lower()
    if lowered.endswith(" test"):
        return bedrijfsnaam[:-5].strip()
    return bedrijfsnaam


def get_company_recipient(instellingen: dict, user_email: Optional[str] = None) -> Optional[str]:
    """Get the company email for werkbon receipts.

    Strict per-tenant priority (NO hardcoded fallbacks):
      1. instellingen.werkbon_email (werkbon-specific company inbox)
      2. instellingen.email (general company email)
      3. user_email (the logged-in user's own login address)

    Returns None only when none of the above is configured — caller
    must then refuse to send rather than fall back to any default.
    """
    werkbon_email = (instellingen.get("werkbon_email") or "").strip()
    if werkbon_email:
        return werkbon_email
    company_email = (instellingen.get("email") or "").strip()
    if company_email:
        return company_email
    if user_email and user_email.strip():
        return user_email.strip()
    return None


async def get_instellingen_for_company(company_id: Optional[str]) -> dict:
    """Strict multi-tenant instellingen lookup. Returns {} if no doc exists for this company.
    Never falls back to another tenant's data."""
    if not company_id:
        return {}
    doc = await db.instellingen.find_one({"id": "company_settings", "company_id": company_id}, {"_id": 0})
    return doc or {}


def _require_tenant(current_user: Dict) -> str:
    """Return the user's company_id or raise 403 — NEVER silently fall back to
    'default_company'. A missing company_id on the JWT means we cannot identify
    the tenant, and assuming default_company would hand the requester all of
    the legacy Smart-Tech data. Platform/master admin endpoints that legitimately
    cross tenants must NOT call this helper — they pass the target company_id
    explicitly as a path/query parameter."""
    company_id = current_user.get("company_id") if current_user else None
    if not company_id:
        raise HTTPException(
            status_code=403,
            detail="Geen company_id in token — toegang geweigerd",
        )
    return company_id


# ==================== PLAN / FEATURE MATRIX ====================
# Single source of truth for what each plan can do. Backend enforcement
# reads from here; frontend reads via /api/subscription/plan-info.

PLAN_LIMITS: Dict[str, Dict[str, Optional[int]]] = {
    "basic": {"werknemers": 5, "klanten": 10, "werven": 5},
    "pro": {"werknemers": None, "klanten": None, "werven": None},  # None = unlimited
    "free": {"werknemers": None, "klanten": None, "werven": None},
}

PLAN_FEATURES: Dict[str, Dict[str, Any]] = {
    "basic": {
        "werkbon_types": ["uren"],
        "billit": False,
        "berichten": False,
        "planning_advanced": False,
        "pdf_custom": False,
        "rapporten_export": False,
    },
    "pro": {
        "werkbon_types": ["uren", "dag", "oplevering", "project", "prestatie"],
        "billit": True,
        "berichten": True,
        "planning_advanced": True,
        "pdf_custom": True,
        "rapporten_export": True,
    },
    "free": {
        "werkbon_types": ["uren", "dag", "oplevering", "project", "prestatie"],
        "billit": True,
        "berichten": True,
        "planning_advanced": True,
        "pdf_custom": True,
        "rapporten_export": True,
    },
}


def _normalize_plan(value: Optional[str]) -> str:
    """Map any subscription_status / selected_plan flavour to a canonical plan key."""
    if not value:
        return "basic"
    v = value.lower().strip()
    if v in ("free",):
        return "free"
    if v in ("pro", "active_pro"):
        return "pro"
    if v in ("basic", "active_basic"):
        return "basic"
    return "basic"


def _trial_remaining(company: dict) -> Tuple[bool, Optional[int]]:
    """Returns (is_active_trial, days_remaining). is_active_trial=True only when trial not expired."""
    trial_end_str = company.get("trial_end_date")
    if not trial_end_str:
        return False, None
    try:
        trial_end = datetime.fromisoformat(trial_end_str.replace("Z", "+00:00"))
    except Exception:
        return False, None
    now = datetime.now(timezone.utc)
    delta = trial_end - now
    days_remaining = max(0, int(delta.total_seconds() // 86400))
    return delta.total_seconds() > 0, days_remaining


async def _resolve_company_plan(company_id: str) -> Tuple[dict, str, dict]:
    """Resolve effective plan for a company.

    Returns (subscription_dict, effective_plan, company_doc).
    Side effect: when subscription_status='trial' and trial_end has passed AND
    selected_plan is set, auto-convert subscription_status to active_<plan>.

    subscription_dict shape:
      {status, days_remaining, is_active, is_trial_expired,
       requires_plan_selection, plan, plan_source}
    """
    default_plan = "free"
    default_sub = {
        "status": "active",
        "days_remaining": None,
        "is_active": True,
        "is_trial_expired": False,
        "requires_plan_selection": False,
        "plan": default_plan,
        "plan_source": "platform",
    }

    if not company_id or company_id == "default_company":
        return default_sub, default_plan, {}

    company = await db.companies.find_one({"id": company_id}) or {}
    if not company:
        return default_sub, default_plan, {}

    sub_status = (company.get("subscription_status") or "active").lower()
    selected_plan = company.get("selected_plan") or company.get("pakket")

    # Free plan = always-on, ignore everything else
    if (selected_plan or "").lower() == "free":
        return ({
            "status": "free",
            "days_remaining": None,
            "is_active": True,
            "is_trial_expired": False,
            "requires_plan_selection": False,
            "plan": "free",
            "plan_source": "free",
        }, "free", company)

    # active / active_basic / active_pro → fully active on the chosen plan
    if sub_status.startswith("active"):
        plan = _normalize_plan(sub_status if sub_status != "active" else selected_plan)
        return ({
            "status": sub_status,
            "days_remaining": None,
            "is_active": True,
            "is_trial_expired": False,
            "requires_plan_selection": False,
            "plan": plan,
            "plan_source": "subscription",
        }, plan, company)

    # blocked → blocked, no access
    if sub_status == "blocked":
        return ({
            "status": "blocked",
            "days_remaining": None,
            "is_active": False,
            "is_trial_expired": False,
            "requires_plan_selection": False,
            "plan": _normalize_plan(selected_plan) if selected_plan else "basic",
            "plan_source": "subscription",
        }, _normalize_plan(selected_plan) if selected_plan else "basic", company)

    # trial path
    if sub_status == "trial":
        trial_active, days_remaining = _trial_remaining(company)
        if trial_active:
            # During trial: full Pro access regardless of selected_plan
            return ({
                "status": "trial",
                "days_remaining": days_remaining,
                "is_active": True,
                "is_trial_expired": False,
                "requires_plan_selection": False,
                "plan": "pro",
                "plan_source": "trial",
            }, "pro", company)

        # trial expired
        if selected_plan and selected_plan.lower() in ("basic", "pro"):
            new_status = f"active_{selected_plan.lower()}"
            try:
                await db.companies.update_one(
                    {"id": company_id},
                    {"$set": {"subscription_status": new_status}},
                )
                logging.info("[plan] Auto-converted %s trial→%s", company_id, new_status)
            except Exception as exc:
                logging.warning("[plan] Auto-convert persist failed: %s", exc)
            return ({
                "status": new_status,
                "days_remaining": 0,
                "is_active": True,
                "is_trial_expired": False,
                "requires_plan_selection": False,
                "plan": selected_plan.lower(),
                "plan_source": "auto_conversion",
            }, selected_plan.lower(), company)

        # trial expired with no plan picked → must choose
        return ({
            "status": "trial_expired_no_plan",
            "days_remaining": 0,
            "is_active": False,
            "is_trial_expired": True,
            "requires_plan_selection": True,
            "plan": "basic",
            "plan_source": "default",
        }, "basic", company)

    # unknown status → treat as basic active
    return ({
        "status": sub_status or "active",
        "days_remaining": None,
        "is_active": True,
        "is_trial_expired": False,
        "requires_plan_selection": False,
        "plan": _normalize_plan(selected_plan),
        "plan_source": "fallback",
    }, _normalize_plan(selected_plan), company)


async def get_company_subscription_status(company_id: str) -> dict:
    """Backwards-compatible thin wrapper. Prefer _resolve_company_plan."""
    sub, _plan, _company = await _resolve_company_plan(company_id)
    # legacy callers expect at least these keys; keep extras for new callers
    return sub


def _plan_limit(plan: str, resource: str) -> Optional[int]:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["basic"]).get(resource)


def _plan_feature(plan: str, feature: str) -> Any:
    return PLAN_FEATURES.get(plan, PLAN_FEATURES["basic"]).get(feature)


async def _enforce_limit(company_id: str, plan: str, resource: str, collection: str, base_query: Optional[dict] = None):
    """Raise 403 if creating one more would exceed the plan's limit on this resource."""
    limit = _plan_limit(plan, resource)
    if limit is None:
        return
    q = dict(base_query or {})
    q["company_id"] = company_id
    current = await db[collection].count_documents(q)
    if current >= limit:
        nice = {"werknemers": "werknemers", "klanten": "klanten", "werven": "werven"}.get(resource, resource)
        raise HTTPException(
            status_code=403,
            detail=f"Limiet bereikt: uw plan staat maximaal {limit} {nice} toe. Upgrade naar Pro voor onbeperkt aantal {nice}.",
        )


def _require_feature(plan: str, feature: str, label: Optional[str] = None):
    """Raise 403 when the feature is disabled on the caller's plan."""
    if _plan_feature(plan, feature):
        return
    pretty = label or feature
    raise HTTPException(
        status_code=403,
        detail=f"{pretty} is beschikbaar in het Pro-abonnement. Upgrade naar Pro om deze functie te gebruiken.",
    )


def _require_werkbon_type(plan: str, werkbon_type: str):
    allowed = _plan_feature(plan, "werkbon_types") or ["uren"]
    if werkbon_type not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Werkbon type '{werkbon_type}' is alleen beschikbaar in het Pro-abonnement.",
        )


def get_unique_recipients(*emails: Optional[str]) -> List[str]:
    recipients: List[str] = []
    for email in emails:
        normalized = (email or "").strip().lower()
        if normalized and normalized not in recipients:
            recipients.append(normalized)
    return recipients


# ==================== HELPER: SAFE NUMERIC VALUE EXTRACTION ====================

# Afkortingen that should NOT be counted as hours
AFKORTINGEN = ['Z', 'V', 'OV', 'BV', 'F', 'ADV']

def is_afkorting(value) -> bool:
    """Check if a value is an afkorting (sick/leave code) rather than a number"""
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip().upper() in AFKORTINGEN
    return False


def format_number(value) -> str:
    if is_afkorting(value):
        return str(value).strip().upper()
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return str(value) if value else "-"
    if numeric == 0:
        return "-"
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:.2f}".rstrip("0").rstrip(".")

def safe_float(value, default: float = 0.0) -> float:
    """
    Safely convert a value to float.
    Returns 0.0 for afkortingen (Z, V, OV, etc.) and invalid values.
    """
    if value is None:
        return default
    if is_afkorting(value):
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

def calculate_total_uren(werkbon: dict) -> float:
    """
    Calculate total hours from werkbon uren regels.
    Skips afkortingen (Z, V, OV, BV, F, ADV) - only sums numeric values.
    """
    total_uren = 0.0
    for regel in werkbon.get("uren", []):
        for dag, _, _, _ in DAY_COLUMNS:
            val = regel.get(dag, 0)
            total_uren += safe_float(val)
    return total_uren


def klant_standaard_uurtarief_eur(klant: dict) -> float:
    """Prefer standaard_uurtarief, fallback to legacy uurtarief."""
    v = klant.get("standaard_uurtarief")
    if v is not None and v != "":
        return safe_float(v)
    return safe_float(klant.get("uurtarief", 0))


def werkbon_km_tot_km(werkbon: dict) -> float:
    km = werkbon.get("km_afstand") or {}
    return sum(safe_float(km.get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS)


def klant_km_tarief_eur_per_km(klant: dict) -> float:
    return safe_float(klant.get("km_vergoeding_tarief", 0))


def compute_werkbon_financials(werkbon: dict, klant: dict) -> dict:
    """
    Urenbedrag = total_uren × klant uurtarief; KM-bedrag = totaal km × klant km-tarief (niet werkbon-snapshot).
    """
    total_uren = calculate_total_uren(werkbon)
    uurtarief = klant_standaard_uurtarief_eur(klant)
    km_tot = werkbon_km_tot_km(werkbon)
    km_tarief = klant_km_tarief_eur_per_km(klant)
    uren_bedrag = total_uren * uurtarief
    km_bedrag = km_tot * km_tarief if km_tarief > 0 else 0.0
    totaal_bedrag = uren_bedrag + km_bedrag
    return {
        "total_uren": total_uren,
        "uurtarief": uurtarief,
        "km_tot": km_tot,
        "km_tarief": km_tarief,
        "uren_bedrag": uren_bedrag,
        "km_bedrag": km_bedrag,
        "totaal_bedrag": totaal_bedrag,
    }


def decode_base64_data(data_uri: Optional[str], max_size_mb: float = 2.0) -> Optional[bytes]:
    """
    Decode base64 data URI to bytes.
    
    Args:
        data_uri: Base64 encoded data or URL
        max_size_mb: Maximum allowed size in MB (default 2MB to prevent memory issues)
    
    Returns:
        Decoded bytes or None if invalid/too large
    """
    if not data_uri:
        return None

    source = data_uri.strip()
    if source.startswith("http://") or source.startswith("https://"):
        try:
            response = requests.get(source, timeout=15)
            response.raise_for_status()
            return response.content
        except Exception:
            logging.warning("Could not download image source: %s", source)
            return None

    encoded = source.split(",", 1)[1] if "," in source else source
    
    # Check estimated decoded size (base64 is ~33% larger than binary)
    estimated_size_mb = len(encoded) * 0.75 / (1024 * 1024)
    if estimated_size_mb > max_size_mb:
        logging.warning(f"Base64 data too large ({estimated_size_mb:.1f}MB > {max_size_mb}MB), will be processed with reduced quality")
    
    try:
        return base64.b64decode(encoded)
    except Exception:
        logging.warning("Could not decode image source as base64")
        return None


def correct_image_orientation(pil_image):
    """Correct image orientation based on EXIF data."""
    try:
        from PIL import ExifTags
        
        # Get EXIF data
        exif = pil_image.getexif()
        if not exif:
            return pil_image
        
        # Find the orientation tag
        orientation_tag = None
        for tag, name in ExifTags.TAGS.items():
            if name == 'Orientation':
                orientation_tag = tag
                break
        
        if orientation_tag is None or orientation_tag not in exif:
            return pil_image
        
        orientation = exif[orientation_tag]
        
        # Apply rotation based on EXIF orientation
        if orientation == 2:
            pil_image = pil_image.transpose(PILImage.FLIP_LEFT_RIGHT)
        elif orientation == 3:
            pil_image = pil_image.rotate(180, expand=True)
        elif orientation == 4:
            pil_image = pil_image.transpose(PILImage.FLIP_TOP_BOTTOM)
        elif orientation == 5:
            pil_image = pil_image.transpose(PILImage.FLIP_LEFT_RIGHT).rotate(90, expand=True)
        elif orientation == 6:
            pil_image = pil_image.rotate(-90, expand=True)
        elif orientation == 7:
            pil_image = pil_image.transpose(PILImage.FLIP_LEFT_RIGHT).rotate(-90, expand=True)
        elif orientation == 8:
            pil_image = pil_image.rotate(90, expand=True)
        
        return pil_image
    except Exception as exc:
        logging.warning("Could not correct image orientation: %s", exc)
        return pil_image


def make_safe_reportlab_image(image_bytes: Optional[bytes], width: float, height: float) -> Optional[Image]:
    """
    Convert image bytes to ReportLab Image with aggressive memory optimization.
    Uses thumbnail loading to prevent memory overflow on large images.
    """
    if not image_bytes:
        return None

    try:
        import gc
        source = io.BytesIO(image_bytes)
        
        # CRITICAL: Use thumbnail to limit memory usage when opening large images
        # This prevents loading full resolution into memory
        with PILImage.open(source) as pil_image:
            # For very large images, use draft mode to reduce memory
            # Draft mode loads a reduced version directly
            original_size = pil_image.size
            
            # Calculate target size - max 400px for PDF (smaller = less memory)
            max_dimension = 400
            
            # Use thumbnail which modifies in place and is memory efficient
            pil_image.thumbnail((max_dimension, max_dimension), PILImage.Resampling.BILINEAR)
            
            # Apply EXIF orientation correction after resize
            pil_image = correct_image_orientation(pil_image)
            
            # Handle transparency: convert to RGB with white background
            if pil_image.mode in ('RGBA', 'LA', 'P'):
                if pil_image.mode == 'P':
                    pil_image = pil_image.convert('RGBA')
                
                background = PILImage.new('RGB', pil_image.size, (255, 255, 255))
                
                if pil_image.mode == 'RGBA':
                    background.paste(pil_image, mask=pil_image.split()[3])
                elif pil_image.mode == 'LA':
                    background.paste(pil_image.convert('L'), mask=pil_image.split()[1])
                
                pil_image = background
            elif pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Save with aggressive compression
            normalized = io.BytesIO()
            pil_image.save(normalized, format="JPEG", quality=60, optimize=True)
        
        # Clean up
        source.close()
        del source
        gc.collect()
        
        normalized.seek(0)
        return Image(normalized, width=width, height=height)
    except Exception as exc:
        logging.warning("Invalid image skipped in PDF: %s", exc)
        return None


_DAGEN_KM = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
_DAGEN_KM_KORT = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"]

def build_km_pdf_block(werkbon: dict, styles: Any, secondary_color: str = "#1a1a2e", accent_color: str = "#F5A623") -> list:
    """Return a list of story elements for the KM section, or empty list if no KM."""
    km = werkbon.get("km_afstand") or {}
    km_total = sum(safe_float(km.get(d, 0)) for d in _DAGEN_KM)
    if km_total <= 0:
        return []
    from reportlab.platypus import Spacer as _Spacer
    from reportlab.platypus import Table as _Table, TableStyle as _TStyle
    from reportlab.lib import colors as _colors
    header = [Paragraph(f"<b>{d}</b>", ParagraphStyle(f"kmhdrb{i}", textColor=_colors.white, fontSize=8, fontName="Helvetica-Bold", alignment=1)) for i, d in enumerate(_DAGEN_KM_KORT + ["Totaal"])]
    row = [format_number(km.get(d, 0)) for d in _DAGEN_KM] + [format_number(km_total)]
    t = _Table([header, row], colWidths=[22 * mm] * 8)
    t.setStyle(_TStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _colors.HexColor(secondary_color)),
        ("TEXTCOLOR", (0, 0), (-1, 0), _colors.white),
        ("BACKGROUND", (-1, 1), (-1, 1), _colors.HexColor(accent_color)),
        ("BOX", (0, 0), (-1, -1), 0.8, _colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, _colors.HexColor("#d9d9d9")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return [_Spacer(1, 6), Paragraph("KM-afstand heen & terug", styles["SectionTitle"] if "SectionTitle" in styles else styles["Heading2"]), t]


def compress_image_bytes_for_pdf(image_bytes: Optional[bytes], max_px: int = 800, quality: int = 40) -> Optional[bytes]:
    """Compress image bytes to max_px and quality% before PDF processing to reduce memory usage."""
    if not image_bytes:
        return image_bytes
    try:
        import gc
        src = io.BytesIO(image_bytes)
        with PILImage.open(src) as img:
            img.thumbnail((max_px, max_px), PILImage.Resampling.BILINEAR)
            if img.mode in ('RGBA', 'LA', 'P'):
                if img.mode == 'P':
                    img = img.convert('RGBA')
                bg = PILImage.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'RGBA':
                    bg.paste(img, mask=img.split()[3])
                else:
                    bg.paste(img.convert('L'), mask=img.split()[1])
                img = bg
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=quality, optimize=True)
        src.close()
        gc.collect()
        out.seek(0)
        return out.getvalue()
    except Exception as exc:
        logging.warning("compress_image_bytes_for_pdf failed: %s", exc)
        return image_bytes


def get_hours_or_code(regel: dict, dag: str, afkorting_key: str) -> str:
    afkorting = (regel.get(afkorting_key) or "").strip()
    if afkorting:
        return afkorting
    return format_number(regel.get(dag, 0))


def build_pdf_filename(werkbon: dict) -> str:
    werf = (werkbon.get("werf_naam") or "werf").lower().replace(" ", "-")
    safe_werf = "".join(char for char in werf if char.isalnum() or char == "-") or "werf"
    return f"werkbon-week-{werkbon.get('week_nummer', 'x')}-{werkbon.get('jaar', 'x')}-{safe_werf}.pdf"


def build_oplevering_pdf_filename(werkbon: dict) -> str:
    werf = (werkbon.get("werf_naam") or "werf").lower().replace(" ", "-")
    safe_werf = "".join(char for char in werf if char.isalnum() or char == "-") or "werf"
    datum = (werkbon.get("datum") or "datum").replace("/", "-")
    return f"oplevering-{datum}-{safe_werf}.pdf"


def validate_oplevering_payload(data: OpleveringWerkbonCreate) -> None:
    if data.schade_status not in {"geen_schade", "schade_aanwezig"}:
        raise HTTPException(status_code=400, detail="Ongeldige schade status")

    if data.schade_status == "schade_aanwezig" and not data.fotos:
        raise HTTPException(status_code=400, detail="Bij schade is minimaal 1 foto verplicht")

    if data.verstuur_naar_klant and not (data.klant_email_override or "").strip():
        raise HTTPException(status_code=400, detail="Klant e-mail is verplicht wanneer u naar de klant wilt versturen")

    if not data.handtekening_klant or not data.handtekening_klant_naam.strip():
        raise HTTPException(status_code=400, detail="Klant handtekening en naam zijn verplicht")

    if len(data.beoordelingen) < 5:
        raise HTTPException(status_code=400, detail="Vul 5 beoordelingen in")

    for beoordeling in data.beoordelingen:
        if beoordeling.score < 1 or beoordeling.score > 5:
            raise HTTPException(status_code=400, detail="Beoordelingen moeten tussen 1 en 5 sterren zijn")


def get_hours_pdf(regel: dict, dag: str) -> str:
    """Return hours for PDF - show afkorting codes as-is, numeric hours as formatted number"""
    val = regel.get(dag, 0)
    if is_afkorting(val):
        return str(val).strip().upper()  # Z, V, BV etc. tonen
    hours = safe_float(val)
    if hours == 0:
        return ""
    return format_number(hours)


def generate_werkbon_pdf(werkbon: dict, klant: dict, werf: dict, instellingen: dict, total_uren: float, totaal_bedrag: float) -> tuple[bytes, str]:
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=15 * mm,
        bottomMargin=10 * mm,
    )

    # Dynamic brand colors from instellingen
    _C = get_pdf_colors(instellingen)
    _primary   = _C["primary"]
    _secondary = _C["secondary"]
    _accent    = _C["accent"]

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=9, textColor=colors.HexColor(_primary), spaceAfter=1, spaceBefore=0))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=6, leading=8))
    styles.add(ParagraphStyle(name="FooterText", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="WeekHeader", parent=styles["Title"], fontSize=20, textColor=colors.HexColor(_secondary), fontName="Helvetica-Bold", alignment=2))
    # Auto-contrast text colors
    _hdr_text = colors.white if is_dark_color(_secondary) else colors.black
    _accent_text = colors.white if is_dark_color(_accent) else colors.black

    story = []

    # ── MAIN HEADER: 3-column [Logo | TIMESHEET + Week | Firma info] ──
    # Logo slot: tenant's uploaded logo OR tenant's bedrijfsnaam in caps —
    # never the Signybon platform logo.
    logo_cell: list = [make_logo_or_brand_flowable(instellingen, 38 * mm, 28 * mm)]

    # Use current year dynamically
    current_year = datetime.now().year
    werkbon_jaar = werkbon.get('jaar', current_year)
    werkbon_week = werkbon.get('week_nummer', '00')

    # Generate werkbon number: YYYY-WW-XXX format
    werkbon_id = werkbon.get('id', werkbon.get('_id', ''))
    if werkbon_id:
        seq_num = str(werkbon_id)[-4:].upper()
    else:
        seq_num = str(hash(str(werkbon.get('created_at', ''))))[-4:]
    werkbon_nummer = f"{werkbon_jaar}-W{werkbon_week:0>2}-{seq_num}"

    # Center column: WEEK + Werkbon nr only (TIMESHEET moved to right col)
    center_cell: list = [
        Paragraph(f"WEEK {werkbon_week}-{werkbon_jaar}", ParagraphStyle(
            "TSWeek", fontName="Helvetica-Bold", fontSize=13,
            textColor=colors.HexColor(_secondary), alignment=1, spaceBefore=0, spaceAfter=0,
        )),
        Spacer(1, 2),
        Paragraph(f"Werkbon nr: {werkbon_nummer}", ParagraphStyle(
            "TSNr", fontName="Helvetica-Bold", fontSize=9,
            textColor=colors.HexColor(_primary), alignment=1, spaceBefore=0,
        )),
    ]

    # Adres 2 aparte regels: straat+nr / postcode+stad
    bedrijfsnaam_pdf = instellingen.get("bedrijfsnaam", "Signybon")
    _adres_line1, _adres_line2 = get_company_address_2lines(instellingen)
    company_lines = [
        f"<b>{bedrijfsnaam_pdf}</b>",
        _adres_line1 or "",
        _adres_line2 or "",
        instellingen.get("telefoon") or "",
        instellingen.get("email") or "",
        f"BTW: {instellingen['btw_nummer']}" if instellingen.get("btw_nummer") else "",
    ]
    company_detail_text = "<br/>".join(line for line in company_lines if line)

    # Right column: nested table [TIMESHEET (left, centered) | Firma info (right)]
    timesheet_para = Paragraph("TIMESHEET", ParagraphStyle(
        "TSBig", fontName="Helvetica-Bold", fontSize=22,
        textColor=colors.HexColor(_secondary), alignment=1, spaceBefore=0, spaceAfter=0,
    ))
    firma_para = Paragraph(company_detail_text or "-", ParagraphStyle(
        "CompRight", fontSize=8, leading=11, textColor=colors.HexColor("#333333"), alignment=2,
    ))
    right_inner = Table([[timesheet_para, firma_para]], colWidths=[55 * mm, 101 * mm])
    right_inner.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    right_cell: list = [right_inner]

    # Logo(45) + Center(65) + Right(161) = 271mm
    header_table = Table([[logo_cell, center_cell, right_cell]], colWidths=[45 * mm, 65 * mm, 161 * mm], rowHeights=[32 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(_accent)),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor(_accent)),
        ("LINEAFTER", (1, 0), (1, -1), 0.5, colors.HexColor(_accent)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#fff8ee")),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 1))

    # ── INFO SECTION ──
    info_left = [
        ["Periode", f"{werkbon.get('datum_maandag', '-')} t/m {werkbon.get('datum_zondag', '-')}"],
        ["Ingevuld door", werkbon.get("ingevuld_door_naam", "-")],
        ["Status", werkbon.get("status", "concept").capitalize()],
    ]
    info_right = [
        ["Klant", werkbon.get("klant_naam", "-")],
        ["Werf", werkbon.get("werf_naam", "-")],
        ["Adres werf", werf.get("adres") or "-"],
        ["Klant e-mail", klant.get("email") or "-"],
    ]
    if klant.get("btw_nummer"):
        info_right.append(["BTW Nr.", klant.get("btw_nummer")])

    left_table = Table(info_left, colWidths=[32 * mm, 90 * mm])
    right_table = Table(info_right, colWidths=[32 * mm, 100 * mm])
    for table in (left_table, right_table):
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor(_primary)),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))

    story.append(Table([[left_table, right_table]], colWidths=[125 * mm, 135 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(Spacer(1, 1))

    # ── UREN TABEL (geen afkortingen) ──
    story.append(Paragraph("Gewerkte uren", styles["SectionTitle"]))
    hours_header = [[
        Paragraph("<b>Werknemer</b>", ParagraphStyle("hdr", textColor=_hdr_text, fontSize=7, fontName="Helvetica-Bold")),
        *[Paragraph(f"<b>{label}</b><br/><font size=6>{werkbon.get(date_key,'')}</font>",
            ParagraphStyle("hdr2", textColor=_hdr_text, fontSize=7, fontName="Helvetica-Bold", alignment=1))
          for _, label, date_key, _ in DAY_COLUMNS],
        Paragraph("<b>Totaal</b>", ParagraphStyle("hdr3", textColor=_hdr_text, fontSize=7, fontName="Helvetica-Bold", alignment=1))
    ]]
    hours_rows = []
    for regel in werkbon.get("uren", []):
        totaal = sum(safe_float(regel.get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS)
        naam = (regel.get("teamlid_naam") or
                regel.get("werknemer_naam") or
                regel.get("naam") or "-")
        hours_rows.append(
            [naam]
            + [get_hours_pdf(regel, dag) for dag, _, _, _ in DAY_COLUMNS]
            + [format_number(totaal) if totaal else ""]
        )

    dag_totalen = [
        format_number(s) if (s := sum(safe_float(r.get(dag, 0)) for r in werkbon.get("uren", []))) else ""
        for dag, _, _, _ in DAY_COLUMNS
    ]
    hours_rows.append(["TOTAAL"] + dag_totalen + [format_number(total_uren)])
    hours_table = Table(hours_header + hours_rows, colWidths=[58 * mm] + [22 * mm] * 7 + [22 * mm])
    hours_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), _hdr_text),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(_accent)),
        ("TEXTCOLOR", (0, -1), (-1, -1), _accent_text),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(hours_table)

    # ── KM ──
    km_total = sum(safe_float(werkbon.get("km_afstand", {}).get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS)
    if km_total > 0:
        story.append(Spacer(1, 1))
        story.append(Paragraph("KM-afstand (heen & terug)", styles["SectionTitle"]))
        km_header = [[
            *[Paragraph(f"<b>{label}</b>", ParagraphStyle("kmhdr", textColor=_hdr_text, fontSize=6, fontName="Helvetica-Bold", alignment=1))
              for _, label, _, _ in DAY_COLUMNS],
            Paragraph("<b>Totaal</b>", ParagraphStyle("kmhdr2", textColor=_hdr_text, fontSize=6, fontName="Helvetica-Bold", alignment=1))
        ]]
        km_row = [[format_number(werkbon.get("km_afstand", {}).get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS] + [format_number(km_total)]]
        km_table = Table(km_header + km_row, colWidths=[22 * mm] * 7 + [22 * mm])
        km_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
            ("TEXTCOLOR", (0, 0), (-1, 0), _hdr_text),
            ("BACKGROUND", (-1, 1), (-1, 1), colors.HexColor(_accent)),
            ("TEXTCOLOR", (-1, 1), (-1, 1), _accent_text),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        story.append(km_table)

    # ── WERKEN & OPMERKINGEN (naast elkaar) ──
    has_werken = bool(werkbon.get("uitgevoerde_werken"))
    has_opmerkingen = bool(werkbon.get("opmerkingen") or werkbon.get("extra_opmerkingen"))
    has_mat = bool(werkbon.get("extra_materialen"))
    if has_werken or has_opmerkingen or has_mat:
        story.append(Spacer(1, 1))
        _sec_style = ParagraphStyle("SecLabel", parent=styles["BodySmall"], fontName="Helvetica-Bold", textColor=colors.HexColor(_primary))
        left_cell_d = []
        right_cell_d = []
        if has_werken:
            left_cell_d.append(Paragraph("Uitgevoerde werken:", _sec_style))
            left_cell_d.append(Paragraph(werkbon.get("uitgevoerde_werken", "-").replace("\n", "<br/>"), styles["BodySmall"]))
        opm_text = werkbon.get("opmerkingen") or werkbon.get("extra_opmerkingen") or ""
        if opm_text:
            right_cell_d.append(Paragraph("Opmerkingen:", _sec_style))
            right_cell_d.append(Paragraph(opm_text.replace("\n", "<br/>"), styles["BodySmall"]))
        elif has_mat:
            right_cell_d.append(Paragraph("Extra materialen:", _sec_style))
            right_cell_d.append(Paragraph(werkbon.get("extra_materialen", "-").replace("\n", "<br/>"), styles["BodySmall"]))
        _empty_cell = [Paragraph("", styles["BodySmall"])]
        desc_table = Table([[left_cell_d or _empty_cell, right_cell_d or _empty_cell]], colWidths=[130 * mm, 130 * mm])
        desc_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("LINEBEFORE", (1, 0), (1, 0), 0.5, colors.HexColor("#cccccc")),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(desc_table)

    # ── SAMENVATTING + HANDTEKENING (naast elkaar) ──
    story.append(Spacer(1, 1))
    fin = compute_werkbon_financials(werkbon, klant)
    uurtarief_pdf = fin["uurtarief"]
    km_totaal_voor_vergoeding = fin["km_tot"]
    km_tarief = fin["km_tarief"]
    km_bedrag = fin["km_bedrag"]
    totaal_bedrag_incl_km = fin["totaal_bedrag"]
    summary_rows = [
        ["Totaal uren", format_number(total_uren)],
        ["Uurtarief", f"€ {uurtarief_pdf:.2f}"],
    ]
    if km_totaal_voor_vergoeding > 0:
        summary_rows.append(["Totaal KM", f"{format_number(km_totaal_voor_vergoeding)} km"])
    if klant.get("prijsafspraak"):
        summary_rows.append(["Prijsafspraak", klant.get("prijsafspraak")])
    if km_totaal_voor_vergoeding > 0 and km_tarief > 0:
        summary_rows.append([
            "KM vergoeding",
            f"{format_number(km_totaal_voor_vergoeding)} km × € {km_tarief:.2f} = € {km_bedrag:.2f}",
        ])
    elif km_totaal_voor_vergoeding > 0 and km_tarief <= 0:
        summary_rows.append(["KM vergoeding", f"{format_number(km_totaal_voor_vergoeding)} km (geen €/km)"])
    summary_rows.append(["Totaalbedrag", f"€ {totaal_bedrag_incl_km:.2f}"])

    summary_table = Table(summary_rows, colWidths=[40 * mm, 55 * mm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -2), colors.HexColor("#f5f5f5")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(_accent)),
        ("TEXTCOLOR", (0, -1), (-1, -1), _accent_text),
        ("TEXTCOLOR", (0, 0), (0, -2), colors.HexColor(_primary)),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(_accent)),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    # Signature cell - BACKWARD COMPATIBLE: check both field names
    sig_content = []
    # Try handtekening_data first, fallback to handtekening (old field name)
    signature_data = werkbon.get("handtekening_data") or werkbon.get("handtekening")
    
    if signature_data:
        confirmation_text = instellingen.get("uren_confirmation_text") or "Hierbij bevestigt de klant dat deze ingevulde werkbon juist is ingevuld."
        sig_content.append(Paragraph(confirmation_text.replace("\n", "<br/>"), styles["BodySmall"]))
        sig_content.append(Spacer(1, 3))
        sig_content.append(Paragraph("<b>Handtekening klant</b>", styles["BodySmall"]))
        if werkbon.get("handtekening_naam"):
            sig_content.append(Paragraph(f"Naam: {werkbon.get('handtekening_naam')}", styles["BodySmall"]))
        if werkbon.get("handtekening_datum"):
            datum = werkbon.get("handtekening_datum")
            datum_text = datum.strftime("%d-%m-%Y %H:%M") if isinstance(datum, datetime) else str(datum)[:16]
            sig_content.append(Paragraph(f"Datum: {datum_text}", styles["BodySmall"]))
        sig_content.append(Spacer(1, 2))
        sig_bytes = decode_base64_data(signature_data)
        sig_img = make_safe_reportlab_image(sig_bytes, 50 * mm, 18 * mm)

        # GPS locatie
        gps_locatie = werkbon.get("gps_locatie") or ""
        gps_lat = werkbon.get("gps_lat")
        gps_lng = werkbon.get("gps_lng")

        # Check for selfie - BACKWARD COMPATIBLE: check both field names
        selfie_col: list = []
        selfie_data = werkbon.get("selfie_data") or werkbon.get("selfie")
        if selfie_data:
            selfie_bytes = decode_base64_data(selfie_data)
            selfie_img = make_safe_reportlab_image(selfie_bytes, 20 * mm, 20 * mm)
            if selfie_img:
                selfie_col = [
                    Paragraph("<b>Foto</b>", styles["BodySmall"]),
                    Spacer(1, 1),
                    selfie_img,
                ]
                # GPS next to selfie (same column → same row as signature)
                if gps_locatie:
                    selfie_col.append(Paragraph(f"<b>GPS:</b> {gps_locatie}", styles["BodySmall"]))
                elif gps_lat and gps_lng:
                    selfie_col.append(Paragraph(f"<b>GPS:</b> {gps_lat:.5f}, {gps_lng:.5f}", styles["BodySmall"]))
        elif gps_locatie or (gps_lat and gps_lng):
            # No selfie: GPS below signature
            if gps_locatie:
                sig_content.append(Paragraph(f"<b>GPS:</b> {gps_locatie}", styles["BodySmall"]))
            else:
                sig_content.append(Paragraph(f"<b>GPS:</b> {gps_lat:.5f}, {gps_lng:.5f}", styles["BodySmall"]))

        if sig_img:
            if selfie_col:
                # Side-by-side: signature | selfie+GPS
                inner_sig_table = Table(
                    [[sig_img, selfie_col]],
                    colWidths=[75 * mm, 28 * mm],
                )
                inner_sig_table.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor("#2d3a5f")),
                    ("LEFTPADDING", (1, 0), (1, -1), 4),
                ]))
                sig_content.append(inner_sig_table)
            else:
                sig_content.append(sig_img)
    else:
        sig_content.append(Paragraph("Nog niet ondertekend", styles["BodySmall"]))

    # 3D: Legal text below summary table (left column), not in signature area
    footer_text = instellingen.get("pdf_voettekst") or LEGAL_TEXT
    footer_para = Paragraph(footer_text.replace("\n", "<br/>"), ParagraphStyle(
        "FooterInline", parent=styles["FooterText"], fontSize=5, leading=7,
        textColor=colors.HexColor("#777777"),
    ))
    left_col_content = [summary_table, Spacer(1, 1), footer_para]

    bottom_table = Table([[left_col_content, sig_content or [""]]], colWidths=[100 * mm, 160 * mm])
    bottom_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(bottom_table)

    # ── WERKFOTO'S (altijd op nieuwe pagina voor compact 1-pagina layout) ──
    fotos = werkbon.get("fotos") or []
    if fotos:
        from reportlab.platypus import PageBreak
        story.append(PageBreak())
        story.append(Paragraph("Werkfoto's", styles["SectionTitle"]))
        foto_images = []
        for foto in fotos[:3]:
            foto_data = foto if isinstance(foto, str) else (foto.get("base64") or foto.get("data") or "")
            raw_bytes = decode_base64_data(foto_data)
            compressed = compress_image_bytes_for_pdf(raw_bytes, max_px=800, quality=40)
            img = make_safe_reportlab_image(compressed, 82 * mm, 60 * mm)
            foto_images.append(img)
        for row_idx in range(0, len(foto_images), 3):
            row_imgs = foto_images[row_idx:row_idx + 3]
            while len(row_imgs) < 3:
                row_imgs.append(Spacer(82 * mm, 60 * mm))
            photo_row = Table([row_imgs], colWidths=[88 * mm, 88 * mm, 88 * mm])
            photo_row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E9ED")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E9ED")),
            ]))
            story.append(photo_row)
            story.append(Spacer(1, 4))


    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_pdf_filename(werkbon)


# ─────────────────────────────────────────────────────────────────────────────
# COMBINED (multi-week) werkbon PDF
#
# A WerkbonGroep bundles N weekly werkbonnen into one document:
#   • One cover page with periode totals
#   • One page per week (identical layout to single-week PDF)
#   • Signature renders only on the last week (single klant signature spans
#     the whole bundle and is stored on the groep, not on individual weeks).
#
# To avoid touching the existing single-week generator, this path duplicates
# the body but shares one styles object across pages.
# ─────────────────────────────────────────────────────────────────────────────

def _setup_werkbon_pdf_styles(instellingen: dict) -> Dict[str, Any]:
    """Return a fresh stylesheet + color palette dict reused across werkbon
    pages within a single combined PDF document."""
    _C = get_pdf_colors(instellingen)
    _primary   = _C["primary"]
    _secondary = _C["secondary"]
    _accent    = _C["accent"]
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=9, textColor=colors.HexColor(_primary), spaceAfter=1, spaceBefore=0))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=6, leading=8))
    styles.add(ParagraphStyle(name="FooterText", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="WeekHeader", parent=styles["Title"], fontSize=20, textColor=colors.HexColor(_secondary), fontName="Helvetica-Bold", alignment=2))
    styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontSize=24, textColor=colors.HexColor(_secondary), fontName="Helvetica-Bold", alignment=1, spaceAfter=4))
    styles.add(ParagraphStyle(name="CoverSub", parent=styles["BodyText"], fontSize=11, textColor=colors.HexColor(_primary), alignment=1, spaceAfter=8))
    styles.add(ParagraphStyle(name="CoverLabel", parent=styles["BodyText"], fontSize=9, textColor=colors.HexColor("#555555")))
    return {
        "styles": styles,
        "primary": _primary,
        "secondary": _secondary,
        "accent": _accent,
        "hdr_text": colors.white if is_dark_color(_secondary) else colors.black,
        "accent_text": colors.white if is_dark_color(_accent) else colors.black,
    }


def _build_groep_cover_page(story: list, ctx: Dict[str, Any], groep: dict, werkbonnen: List[dict], klant: dict, werf: dict, instellingen: dict) -> None:
    """Cover page summarising the whole multi-week werkbon."""
    styles = ctx["styles"]
    _primary = ctx["primary"]
    _secondary = ctx["secondary"]
    _accent = ctx["accent"]
    _hdr_text = ctx["hdr_text"]
    _accent_text = ctx["accent_text"]

    # Header band: tenant logo OR tenant bedrijfsnaam in caps.
    header_left: list = [make_logo_or_brand_flowable(instellingen, 60 * mm, 24 * mm)]
    header_right = [
        Paragraph("MAAND-WERKBON", styles["CoverTitle"]),
        Paragraph(f"Periode {groep.get('periode_van', '?')} t/m {groep.get('periode_tot', '?')}", styles["CoverSub"]),
    ]
    header_table = Table([[header_left, header_right]], colWidths=[80 * mm, 188 * mm], rowHeights=[36 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(_accent)),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#fff8ee")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6))

    # Klant + werf info block
    info_rows = [
        ["Klant", klant.get("naam") or groep.get("klant_naam") or "-"],
        ["Klant e-mail", klant.get("email") or "-"],
        ["Werf", werf.get("naam") or groep.get("werf_naam") or "-"],
        ["Adres werf", werf.get("adres") or "-"],
        ["Aantal weken", str(len(werkbonnen))],
        ["Ingevuld door", groep.get("ingevuld_door_naam") or "-"],
    ]
    info_table = Table(info_rows, colWidths=[45 * mm, 220 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor(_primary)),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8))

    # Per-week breakdown + totals
    story.append(Paragraph("Overzicht per week", styles["SectionTitle"]))
    week_header = [["Week", "Periode", "Uren", "KM", "Bedrag"]]
    week_rows: list = []
    grand_uren = 0.0
    grand_km = 0.0
    grand_bedrag = 0.0
    for w in werkbonnen:
        fin = compute_werkbon_financials(w, klant)
        wk_uren = fin["total_uren"]
        wk_km = fin["km_tot"]
        wk_bedrag = fin["totaal_bedrag"]
        grand_uren += wk_uren
        grand_km += wk_km
        grand_bedrag += wk_bedrag
        week_rows.append([
            f"W{w.get('week_nummer', '?')}-{w.get('jaar', '?')}",
            f"{w.get('datum_maandag', '-')} t/m {w.get('datum_zondag', '-')}",
            format_number(wk_uren),
            format_number(wk_km),
            f"€ {wk_bedrag:.2f}",
        ])
    week_rows.append(["TOTAAL", "", format_number(grand_uren), format_number(grand_km), f"€ {grand_bedrag:.2f}"])
    weeks_table = Table(week_header + week_rows, colWidths=[28 * mm, 90 * mm, 35 * mm, 35 * mm, 40 * mm])
    weeks_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), _hdr_text),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(_accent)),
        ("TEXTCOLOR", (0, -1), (-1, -1), _accent_text),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(weeks_table)
    story.append(Spacer(1, 8))

    # Note that the klant signature appears once at the end
    note_para = Paragraph(
        "<i>De handtekening van de klant geldt voor alle weken in dit document en bevindt zich op de laatste pagina.</i>",
        ParagraphStyle("CoverNote", parent=styles["BodySmall"], fontSize=8, textColor=colors.HexColor("#555555"), alignment=1),
    )
    story.append(note_para)


def _build_werkbon_section(
    story: list,
    ctx: Dict[str, Any],
    werkbon: dict,
    klant: dict,
    werf: dict,
    instellingen: dict,
    total_uren: float,
    totaal_bedrag: float,
    *,
    render_signature: bool = True,
) -> None:
    """Append one week's worth of werkbon flowables to ``story``.

    This is a near-clone of the body of :func:`generate_werkbon_pdf`; the
    single-week generator stays unchanged so existing email flows are not
    perturbed. Differences:
      • the caller supplies a shared styles+colors context (so a single
        SimpleDocTemplate can host multiple werkbon pages)
      • the signature block can be suppressed for non-final weeks via
        ``render_signature=False`` so the klant only signs once
    """
    styles = ctx["styles"]
    _primary = ctx["primary"]
    _secondary = ctx["secondary"]
    _accent = ctx["accent"]
    _hdr_text = ctx["hdr_text"]
    _accent_text = ctx["accent_text"]

    # ── MAIN HEADER ──
    # Logo slot: tenant logo OR tenant bedrijfsnaam caps — no platform fallback.
    logo_cell: list = [make_logo_or_brand_flowable(instellingen, 38 * mm, 28 * mm)]

    werkbon_jaar = werkbon.get('jaar', datetime.now().year)
    werkbon_week = werkbon.get('week_nummer', '00')
    werkbon_id = werkbon.get('id', werkbon.get('_id', ''))
    if werkbon_id:
        seq_num = str(werkbon_id)[-4:].upper()
    else:
        seq_num = str(hash(str(werkbon.get('created_at', ''))))[-4:]
    werkbon_nummer = f"{werkbon_jaar}-W{werkbon_week:0>2}-{seq_num}"

    center_cell: list = [
        Paragraph(f"WEEK {werkbon_week}-{werkbon_jaar}", ParagraphStyle(
            "TSWeek_C", fontName="Helvetica-Bold", fontSize=13,
            textColor=colors.HexColor(_secondary), alignment=1, spaceBefore=0, spaceAfter=0,
        )),
        Spacer(1, 2),
        Paragraph(f"Werkbon nr: {werkbon_nummer}", ParagraphStyle(
            "TSNr_C", fontName="Helvetica-Bold", fontSize=9,
            textColor=colors.HexColor(_primary), alignment=1, spaceBefore=0,
        )),
    ]

    bedrijfsnaam_pdf = instellingen.get("bedrijfsnaam", "Signybon")
    _adres_line1, _adres_line2 = get_company_address_2lines(instellingen)
    company_lines = [
        f"<b>{bedrijfsnaam_pdf}</b>",
        _adres_line1 or "",
        _adres_line2 or "",
        instellingen.get("telefoon") or "",
        instellingen.get("email") or "",
        f"BTW: {instellingen['btw_nummer']}" if instellingen.get("btw_nummer") else "",
    ]
    company_detail_text = "<br/>".join(line for line in company_lines if line)

    timesheet_para = Paragraph("TIMESHEET", ParagraphStyle(
        "TSBig_C", fontName="Helvetica-Bold", fontSize=22,
        textColor=colors.HexColor(_secondary), alignment=1, spaceBefore=0, spaceAfter=0,
    ))
    firma_para = Paragraph(company_detail_text or "-", ParagraphStyle(
        "CompRight_C", fontSize=8, leading=11, textColor=colors.HexColor("#333333"), alignment=2,
    ))
    right_inner = Table([[timesheet_para, firma_para]], colWidths=[55 * mm, 101 * mm])
    right_inner.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    right_cell: list = [right_inner]

    header_table = Table([[logo_cell, center_cell, right_cell]], colWidths=[45 * mm, 65 * mm, 161 * mm], rowHeights=[32 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(_accent)),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor(_accent)),
        ("LINEAFTER", (1, 0), (1, -1), 0.5, colors.HexColor(_accent)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#fff8ee")),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 1))

    # ── INFO SECTION ──
    info_left = [
        ["Periode", f"{werkbon.get('datum_maandag', '-')} t/m {werkbon.get('datum_zondag', '-')}"],
        ["Ingevuld door", werkbon.get("ingevuld_door_naam", "-")],
        ["Status", werkbon.get("status", "concept").capitalize()],
    ]
    info_right = [
        ["Klant", werkbon.get("klant_naam", "-")],
        ["Werf", werkbon.get("werf_naam", "-")],
        ["Adres werf", werf.get("adres") or "-"],
        ["Klant e-mail", klant.get("email") or "-"],
    ]
    if klant.get("btw_nummer"):
        info_right.append(["BTW Nr.", klant.get("btw_nummer")])

    left_table = Table(info_left, colWidths=[32 * mm, 90 * mm])
    right_table = Table(info_right, colWidths=[32 * mm, 100 * mm])
    for table in (left_table, right_table):
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor(_primary)),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
    story.append(Table([[left_table, right_table]], colWidths=[125 * mm, 135 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(Spacer(1, 1))

    # ── UREN TABEL ──
    story.append(Paragraph("Gewerkte uren", styles["SectionTitle"]))
    hours_header = [[
        Paragraph("<b>Werknemer</b>", ParagraphStyle("hdr_c", textColor=_hdr_text, fontSize=7, fontName="Helvetica-Bold")),
        *[Paragraph(f"<b>{label}</b><br/><font size=6>{werkbon.get(date_key,'')}</font>",
            ParagraphStyle("hdr2_c", textColor=_hdr_text, fontSize=7, fontName="Helvetica-Bold", alignment=1))
          for _, label, date_key, _ in DAY_COLUMNS],
        Paragraph("<b>Totaal</b>", ParagraphStyle("hdr3_c", textColor=_hdr_text, fontSize=7, fontName="Helvetica-Bold", alignment=1))
    ]]
    hours_rows: list = []
    for regel in werkbon.get("uren", []):
        totaal = sum(safe_float(regel.get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS)
        naam = (regel.get("teamlid_naam") or regel.get("werknemer_naam") or regel.get("naam") or "-")
        hours_rows.append(
            [naam]
            + [get_hours_pdf(regel, dag) for dag, _, _, _ in DAY_COLUMNS]
            + [format_number(totaal) if totaal else ""]
        )
    dag_totalen = [
        format_number(s) if (s := sum(safe_float(r.get(dag, 0)) for r in werkbon.get("uren", []))) else ""
        for dag, _, _, _ in DAY_COLUMNS
    ]
    hours_rows.append(["TOTAAL"] + dag_totalen + [format_number(total_uren)])
    hours_table = Table(hours_header + hours_rows, colWidths=[58 * mm] + [22 * mm] * 7 + [22 * mm])
    hours_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), _hdr_text),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(_accent)),
        ("TEXTCOLOR", (0, -1), (-1, -1), _accent_text),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(hours_table)

    # ── KM ──
    km_total = sum(safe_float(werkbon.get("km_afstand", {}).get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS)
    if km_total > 0:
        story.append(Spacer(1, 1))
        story.append(Paragraph("KM-afstand (heen & terug)", styles["SectionTitle"]))
        km_header = [[
            *[Paragraph(f"<b>{label}</b>", ParagraphStyle("kmhdr_c", textColor=_hdr_text, fontSize=6, fontName="Helvetica-Bold", alignment=1))
              for _, label, _, _ in DAY_COLUMNS],
            Paragraph("<b>Totaal</b>", ParagraphStyle("kmhdr2_c", textColor=_hdr_text, fontSize=6, fontName="Helvetica-Bold", alignment=1))
        ]]
        km_row = [[format_number(werkbon.get("km_afstand", {}).get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS] + [format_number(km_total)]]
        km_table = Table(km_header + km_row, colWidths=[22 * mm] * 7 + [22 * mm])
        km_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
            ("TEXTCOLOR", (0, 0), (-1, 0), _hdr_text),
            ("BACKGROUND", (-1, 1), (-1, 1), colors.HexColor(_accent)),
            ("TEXTCOLOR", (-1, 1), (-1, 1), _accent_text),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        story.append(km_table)

    # ── WERKEN & OPMERKINGEN ──
    has_werken = bool(werkbon.get("uitgevoerde_werken"))
    has_opmerkingen = bool(werkbon.get("opmerkingen") or werkbon.get("extra_opmerkingen"))
    has_mat = bool(werkbon.get("extra_materialen"))
    if has_werken or has_opmerkingen or has_mat:
        story.append(Spacer(1, 1))
        _sec_style = ParagraphStyle("SecLabel_c", parent=styles["BodySmall"], fontName="Helvetica-Bold", textColor=colors.HexColor(_primary))
        left_cell_d: list = []
        right_cell_d: list = []
        if has_werken:
            left_cell_d.append(Paragraph("Uitgevoerde werken:", _sec_style))
            left_cell_d.append(Paragraph(werkbon.get("uitgevoerde_werken", "-").replace("\n", "<br/>"), styles["BodySmall"]))
        opm_text = werkbon.get("opmerkingen") or werkbon.get("extra_opmerkingen") or ""
        if opm_text:
            right_cell_d.append(Paragraph("Opmerkingen:", _sec_style))
            right_cell_d.append(Paragraph(opm_text.replace("\n", "<br/>"), styles["BodySmall"]))
        elif has_mat:
            right_cell_d.append(Paragraph("Extra materialen:", _sec_style))
            right_cell_d.append(Paragraph(werkbon.get("extra_materialen", "-").replace("\n", "<br/>"), styles["BodySmall"]))
        _empty_cell = [Paragraph("", styles["BodySmall"])]
        desc_table = Table([[left_cell_d or _empty_cell, right_cell_d or _empty_cell]], colWidths=[130 * mm, 130 * mm])
        desc_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("LINEBEFORE", (1, 0), (1, 0), 0.5, colors.HexColor("#cccccc")),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(desc_table)

    # ── SAMENVATTING + HANDTEKENING ──
    story.append(Spacer(1, 1))
    fin = compute_werkbon_financials(werkbon, klant)
    uurtarief_pdf = fin["uurtarief"]
    km_totaal = fin["km_tot"]
    km_tarief = fin["km_tarief"]
    km_bedrag = fin["km_bedrag"]
    totaal_bedrag_incl_km = fin["totaal_bedrag"]
    summary_rows = [
        ["Totaal uren", format_number(total_uren)],
        ["Uurtarief", f"€ {uurtarief_pdf:.2f}"],
    ]
    if km_totaal > 0:
        summary_rows.append(["Totaal KM", f"{format_number(km_totaal)} km"])
    if klant.get("prijsafspraak"):
        summary_rows.append(["Prijsafspraak", klant.get("prijsafspraak")])
    if km_totaal > 0 and km_tarief > 0:
        summary_rows.append(["KM vergoeding", f"{format_number(km_totaal)} km × € {km_tarief:.2f} = € {km_bedrag:.2f}"])
    elif km_totaal > 0 and km_tarief <= 0:
        summary_rows.append(["KM vergoeding", f"{format_number(km_totaal)} km (geen €/km)"])
    summary_rows.append(["Totaalbedrag", f"€ {totaal_bedrag_incl_km:.2f}"])

    summary_table = Table(summary_rows, colWidths=[40 * mm, 55 * mm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -2), colors.HexColor("#f5f5f5")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(_accent)),
        ("TEXTCOLOR", (0, -1), (-1, -1), _accent_text),
        ("TEXTCOLOR", (0, 0), (0, -2), colors.HexColor(_primary)),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(_accent)),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    sig_content: list = []
    if render_signature:
        signature_data = werkbon.get("handtekening_data") or werkbon.get("handtekening")
        if signature_data:
            confirmation_text = instellingen.get("uren_confirmation_text") or "Hierbij bevestigt de klant dat deze ingevulde werkbon juist is ingevuld."
            sig_content.append(Paragraph(confirmation_text.replace("\n", "<br/>"), styles["BodySmall"]))
            sig_content.append(Spacer(1, 3))
            sig_content.append(Paragraph("<b>Handtekening klant (geldig voor alle weken)</b>", styles["BodySmall"]))
            if werkbon.get("handtekening_naam"):
                sig_content.append(Paragraph(f"Naam: {werkbon.get('handtekening_naam')}", styles["BodySmall"]))
            if werkbon.get("handtekening_datum"):
                datum = werkbon.get("handtekening_datum")
                datum_text = datum.strftime("%d-%m-%Y %H:%M") if isinstance(datum, datetime) else str(datum)[:16]
                sig_content.append(Paragraph(f"Datum: {datum_text}", styles["BodySmall"]))
            sig_content.append(Spacer(1, 2))
            sig_bytes = decode_base64_data(signature_data)
            sig_img = make_safe_reportlab_image(sig_bytes, 50 * mm, 18 * mm)
            selfie_data = werkbon.get("selfie_data") or werkbon.get("selfie")
            selfie_col: list = []
            if selfie_data:
                selfie_bytes = decode_base64_data(selfie_data)
                selfie_img = make_safe_reportlab_image(selfie_bytes, 20 * mm, 20 * mm)
                if selfie_img:
                    selfie_col = [Paragraph("<b>Foto</b>", styles["BodySmall"]), Spacer(1, 1), selfie_img]
            if sig_img:
                if selfie_col:
                    inner_sig_table = Table([[sig_img, selfie_col]], colWidths=[75 * mm, 28 * mm])
                    inner_sig_table.setStyle(TableStyle([
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor("#2d3a5f")),
                        ("LEFTPADDING", (1, 0), (1, -1), 4),
                    ]))
                    sig_content.append(inner_sig_table)
                else:
                    sig_content.append(sig_img)
        else:
            sig_content.append(Paragraph("Nog niet ondertekend", styles["BodySmall"]))
    else:
        sig_content.append(Paragraph(
            "<i>Onderdeel van maand-werkbon — handtekening op laatste pagina.</i>",
            ParagraphStyle("BundleNote", parent=styles["BodySmall"], fontSize=7, textColor=colors.HexColor("#777777")),
        ))

    footer_text = instellingen.get("pdf_voettekst") or LEGAL_TEXT
    footer_para = Paragraph(footer_text.replace("\n", "<br/>"), ParagraphStyle(
        "FooterInline_c", parent=styles["FooterText"], fontSize=5, leading=7,
        textColor=colors.HexColor("#777777"),
    ))
    left_col_content = [summary_table, Spacer(1, 1), footer_para]
    bottom_table = Table([[left_col_content, sig_content]], colWidths=[100 * mm, 160 * mm])
    bottom_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(bottom_table)


def _build_groep_pdf_filename(groep: dict) -> str:
    """Build a filesystem-safe filename for the combined PDF."""
    klant_naam = (groep.get("klant_naam") or "klant").strip()
    safe_klant = "".join(c if c.isalnum() or c in "-_" else "-" for c in klant_naam) or "klant"
    return f"werkbon-maand-{groep.get('periode_van', '?')}-tot-{groep.get('periode_tot', '?')}-{safe_klant}.pdf"


def generate_combined_werkbon_pdf(
    groep: dict,
    werkbonnen: List[dict],
    klant: dict,
    werf: dict,
    instellingen: dict,
) -> Tuple[bytes, str]:
    """Generate a single multi-week PDF (cover page + one page per week).

    Caller is responsible for injecting the groep's signature/selfie into the
    last werkbon dict if it wants the final page to render the signature.
    """
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=15 * mm,
        bottomMargin=10 * mm,
    )
    ctx = _setup_werkbon_pdf_styles(instellingen)
    story: list = []

    sorted_wbs = sorted(werkbonnen, key=lambda w: (w.get("jaar", 0), w.get("week_nummer", 0)))
    _build_groep_cover_page(story, ctx, groep, sorted_wbs, klant, werf, instellingen)

    from reportlab.platypus import PageBreak as _PB
    last_idx = len(sorted_wbs) - 1
    for idx, w in enumerate(sorted_wbs):
        story.append(_PB())
        fin = compute_werkbon_financials(w, klant)
        wb = w
        if idx == last_idx and groep.get("handtekening_data"):
            wb = {
                **w,
                "handtekening_data": groep.get("handtekening_data"),
                "handtekening_naam": groep.get("handtekening_naam") or "",
                "handtekening_datum": groep.get("handtekening_datum"),
                "selfie_data": groep.get("selfie_data") or w.get("selfie_data"),
            }
        _build_werkbon_section(
            story, ctx, wb, klant, werf, instellingen,
            fin["total_uren"], fin["totaal_bedrag"],
            render_signature=(idx == last_idx),
        )

    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, _build_groep_pdf_filename(groep)


def generate_oplevering_pdf(werkbon: dict, instellingen: dict) -> tuple[bytes, str]:
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    # Dynamic brand colors from instellingen
    _C = get_pdf_colors(instellingen)
    _primary   = _C["primary"]
    _secondary = _C["secondary"]
    _accent    = _C["accent"]

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="OVSection", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor(_secondary), spaceAfter=5, spaceBefore=4))
    styles.add(ParagraphStyle(name="OVBody", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="OVSmall", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="OVLegal", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#666666"), fontName="Helvetica-Oblique"))

    story = []

    # Company info from instellingen — logo OR bedrijfsnaam caps fallback
    _bedrijfsnaam = instellingen.get("bedrijfsnaam", "Signybon")
    _adres_line1, _adres_line2 = get_company_address_2lines(instellingen)
    _company_email = instellingen.get("email") or ""
    _btw = instellingen.get("btw_nummer") or ""
    company_lines = [f"<b>{_bedrijfsnaam}</b>", _adres_line1, _adres_line2, f"BTW: {_btw}" if _btw else "", _company_email]
    company_info_text = "<br/>".join(line for line in company_lines if line)

    left_cell = [make_logo_or_brand_flowable(instellingen, 40 * mm, 17 * mm), Spacer(1, 4)]
    left_cell.append(Paragraph(company_info_text, ParagraphStyle("CompInfo", fontSize=8, leading=10, textColor=colors.HexColor("#333333"))))

    title_style = ParagraphStyle("OVTitle", fontName="Helvetica-Bold", fontSize=18, textColor=colors.HexColor(_secondary), alignment=2)
    date_style = ParagraphStyle("OVDate", fontSize=9, textColor=colors.HexColor("#555555"), alignment=2)
    status_color = colors.HexColor("#28a745") if werkbon.get('status') == 'ondertekend' else colors.HexColor(_accent)

    title_box = [
        Paragraph("<b>OPLEVERING WERKBON</b>", title_style),
        Spacer(1, 8),
        Paragraph(f"Datum: {werkbon.get('datum') or '-'}", date_style),
        Paragraph(f"Status: {(werkbon.get('status') or 'concept').upper()}", ParagraphStyle("OVStatus", fontSize=9, textColor=status_color, alignment=2, fontName="Helvetica-Bold")),
    ]

    header_table = Table([[left_cell, title_box]], colWidths=[100 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor(_accent)),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (0, -1), "TOP"),
        ("VALIGN", (1, 0), (1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.extend([header_table, Spacer(1, 10)])

    info_rows = [
        ["Klant", werkbon.get("klant_naam") or "-"],
        ["Klant e-mail", werkbon.get("klant_email_override") or werkbon.get("klant_email") or "-"],
        ["Werf", werkbon.get("werf_naam") or "-"],
        ["Adres", werkbon.get("werf_adres") or "-"],
        ["Installatie", werkbon.get("installatie_type") or "-"],
        ["Monteur", werkbon.get("ingevuld_door_naam") or "-"],
    ]
    # Add GPS address support
    if werkbon.get("gps_adres"):
        info_rows.append(["Locatie", werkbon.get("gps_adres")])
    if werkbon.get("gps_locatie"):
        info_rows.append(["GPS Coördinaten", werkbon.get("gps_locatie")])
    info_table = Table(info_rows, colWidths=[40 * mm, 130 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([Paragraph("Algemene info", styles["OVSection"]), info_table, Spacer(1, 8)])

    werk_text = werkbon.get("werk_beschrijving") or "-"
    materiaal_text = werkbon.get("gebruikte_materialen") or "-"
    opmerkingen_text = werkbon.get("extra_opmerkingen") or "-"
    detail_table = Table([
        [Paragraph("<b>Uitgevoerde werken</b>", styles["OVBody"]), Paragraph("<b>Gebruikte materialen</b>", styles["OVBody"])],
        [Paragraph(werk_text.replace("\n", "<br/>"), styles["OVBody"]), Paragraph(materiaal_text.replace("\n", "<br/>"), styles["OVBody"])],
    ], colWidths=[85 * mm, 85 * mm])
    detail_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8f9fa")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([Paragraph("Werk details", styles["OVSection"]), detail_table, Spacer(1, 6)])
    story.append(Paragraph(f"<b>Extra opmerkingen:</b> {opmerkingen_text.replace(chr(10), '<br/>')}", styles["OVBody"]))
    story.append(Spacer(1, 8))

    schade_bool = werkbon.get("schade_status") == "schade_aanwezig"
    schade_status = "Ja" if schade_bool else "Nee"
    schade_text = werkbon.get("schade_opmerking") or "-"
    schade_checks = werkbon.get("schade_checks") or []
    schade_rows = [["Schade", schade_status], ["Toelichting", schade_text]]
    for item in schade_checks:
        label = item.get("label") if isinstance(item, dict) else getattr(item, "label", "Check")
        checked = item.get("checked") if isinstance(item, dict) else getattr(item, "checked", False)
        schade_rows.append([label, "Ja" if checked else "Nee"])
    schade_table = Table(schade_rows, colWidths=[70 * mm, 100 * mm])
    schade_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ffd6d6") if schade_bool else colors.HexColor("#eaf7ee")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([Paragraph("Schadecontrole", styles["OVSection"]), schade_table, Spacer(1, 8)])

    beoordelingen = werkbon.get("beoordelingen") or []
    rating_rows = [["Onderdeel", "Sterren"]]
    for beoordeling in beoordelingen:
        categorie = beoordeling.get("categorie") if isinstance(beoordeling, dict) else getattr(beoordeling, "categorie", "-")
        score = beoordeling.get("score") if isinstance(beoordeling, dict) else getattr(beoordeling, "score", 0)
        rating_rows.append([categorie, "★" * int(score) + "☆" * max(0, 5 - int(score))])
    ratings_table = Table(rating_rows, colWidths=[110 * mm, 60 * mm])
    ratings_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([Paragraph("Klantbeoordeling", styles["OVSection"]), ratings_table, Spacer(1, 8)])

    # KM afstand
    for el in build_km_pdf_block(werkbon, styles, _secondary, _accent):
        story.append(el)

    fotos = werkbon.get("fotos") or []
    if fotos:
        from reportlab.platypus import PageBreak as PBrk
        story.append(Paragraph("Werkfoto's", styles["OVSection"]))
        # Build 2-column grid: 2 photos per row, up to 6 photos (3 rows)
        foto_images = []
        for foto in fotos[:3]:
            foto_data = foto if isinstance(foto, str) else foto.get("base64", "")
            img = make_safe_reportlab_image(decode_base64_data(foto_data), 82 * mm, 108 * mm)
            foto_images.append(img)
        # Pair them into rows of 2
        for row_idx in range(0, len(foto_images), 2):
            if row_idx > 0 and row_idx % 4 == 0:
                story.append(PBrk())
                story.append(Paragraph("Werkfoto's (vervolg)", styles["OVSection"]))
            pair = foto_images[row_idx:row_idx + 2]
            left_img = pair[0] or Spacer(82 * mm, 108 * mm)
            right_img = pair[1] if len(pair) > 1 else Spacer(82 * mm, 108 * mm)
            photo_row_table = Table([[left_img, right_img]], colWidths=[86 * mm, 86 * mm])
            photo_row_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E9ED")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E9ED")),
            ]))
            story.append(photo_row_table)
            story.append(Spacer(1, 6))

    signer_name = werkbon.get("handtekening_klant_naam") or "-"
    signature_bytes = decode_base64_data(werkbon.get("handtekening_klant"))
    signature_image = make_safe_reportlab_image(signature_bytes, 80 * mm, 28 * mm)
    sig_content: list = [Paragraph(f"<b>Klant naam:</b> {signer_name}", styles["OVBody"])]
    if werkbon.get("handtekening_datum"):
        sign_date = werkbon.get("handtekening_datum")
        sig_content.append(Paragraph(f"<b>Ondertekend op:</b> {str(sign_date)[:16]}", styles["OVBody"]))
    elif werkbon.get("handtekening_datum_str"):
        sig_content.append(Paragraph(f"<b>Ondertekend op:</b> {werkbon.get('handtekening_datum_str')}", styles["OVBody"]))
    if werkbon.get("gps_locatie"):
        sig_content.append(Paragraph(f"<b>GPS:</b> {werkbon.get('gps_locatie')}", styles["OVBody"]))
    sig_content.append(Spacer(1, 4))
    if signature_image:
        sig_content.append(signature_image)

    selfie_bytes = decode_base64_data(werkbon.get("selfie_foto"))
    selfie_img = make_safe_reportlab_image(selfie_bytes, 30 * mm, 30 * mm)
    if selfie_img:
        selfie_col: list = [Paragraph("<b>Selfie</b>", styles["OVSmall"]), selfie_img]
        signature_table = Table([[sig_content, selfie_col]], colWidths=[130 * mm, 40 * mm])
    else:
        signature_table = Table([[sig_content]], colWidths=[170 * mm])
    signature_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    confirmation_text = instellingen.get("oplevering_confirmation_text") or "Hierbij bevestigt de klant dat deze ingevulde oplevering bon juist is ingevuld."
    story.extend([Paragraph(confirmation_text.replace("\n", "<br/>"), styles["OVBody"]), Spacer(1, 6), Paragraph("Handtekening klant", styles["OVSection"]), signature_table, Spacer(1, 10)])
    story.append(Paragraph((instellingen.get("pdf_voettekst") or "Digitale oplevering bon").replace("\n", "<br/>"), styles["OVSmall"]))

    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_oplevering_pdf_filename(werkbon)


# ==================== PRODUCTIE WERKBON PDF ====================

def build_productie_pdf_filename(werkbon: dict) -> str:
    safe_werf = (werkbon.get("werf_naam") or "werf").replace(" ", "-").lower()[:20]
    return f"productie-werkbon-{safe_werf}-{werkbon.get('datum', 'datum')}.pdf"


def generate_productie_pdf(werkbon: dict, instellingen: dict) -> tuple[bytes, str]:
    from reportlab.platypus import PageBreak
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm)

    # Dynamic brand colors from instellingen
    _C = get_pdf_colors(instellingen)
    _primary   = _C["primary"]
    _secondary = _C["secondary"]
    _accent    = _C["accent"]

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PSec", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor(_secondary), spaceAfter=5, spaceBefore=4))
    styles.add(ParagraphStyle(name="PBody", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="PSmall", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="PLegal", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#666666"), fontName="Helvetica-Oblique"))

    story = []
    
    # Company info from instellingen — logo OR bedrijfsnaam caps fallback
    _bedrijfsnaam = instellingen.get("bedrijfsnaam", "Signybon")
    _adres_line1, _adres_line2 = get_company_address_2lines(instellingen)
    _company_email = instellingen.get("email") or ""
    _btw = instellingen.get("btw_nummer") or ""
    company_lines = [f"<b>{_bedrijfsnaam}</b>", _adres_line1, _adres_line2, f"BTW: {_btw}" if _btw else "", _company_email]
    company_info_text = "<br/>".join(line for line in company_lines if line)

    left_cell: list = [make_logo_or_brand_flowable(instellingen, 40 * mm, 17 * mm), Spacer(1, 4)]
    left_cell.append(Paragraph(company_info_text, ParagraphStyle("CompInfo", fontSize=8, leading=10, textColor=colors.HexColor("#333333"))))

    # Right side: Werkbon type and info
    title_style = ParagraphStyle("PTitle", fontName="Helvetica-Bold", fontSize=18, textColor=colors.HexColor(_secondary), alignment=2)
    date_style = ParagraphStyle("PDate", fontSize=9, textColor=colors.HexColor("#555555"), alignment=2)
    status_color = colors.HexColor("#28a745") if werkbon.get('status') == 'ondertekend' else colors.HexColor(_accent)

    title_box = [
        Paragraph("<b>PRODUCTIE WERKBON</b>", title_style),
        Spacer(1, 8),
        Paragraph(f"Datum: {werkbon.get('datum') or '-'}", date_style),
        Paragraph(f"Status: {(werkbon.get('status') or 'concept').upper()}", ParagraphStyle("PStatus", fontSize=9, textColor=status_color, alignment=2, fontName="Helvetica-Bold")),
    ]

    header_table = Table([[left_cell, title_box]], colWidths=[100 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor(_accent)),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (0, -1), "TOP"),
        ("VALIGN", (1, 0), (1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.extend([header_table, Spacer(1, 10)])

    # Planning info - with GPS address support
    info_rows = [
        ["Monteur", werkbon.get("werknemer_naam") or werkbon.get("ingevuld_door_naam") or "-"],
        ["Klant", werkbon.get("klant_naam") or "-"],
        ["Werf", werkbon.get("werf_naam") or "-"],
        ["Adres", werkbon.get("werf_adres") or "-"],
        ["Start uur", werkbon.get("start_uur") or "-"],
        ["Eind uur", werkbon.get("eind_uur") or "-"],
        ["Voorziene uur", werkbon.get("voorziene_uur") or "-"],
    ]
    # Add GPS address (human readable) first, then coordinates
    if werkbon.get("gps_adres"):
        info_rows.append(["Locatie", werkbon.get("gps_adres")])
    if werkbon.get("gps_locatie"):
        info_rows.append(["GPS Coördinaten", werkbon.get("gps_locatie")])
    info_table = Table(info_rows, colWidths=[40 * mm, 130 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([Paragraph("Planning info", styles["PSec"]), info_table, Spacer(1, 8)])

    # Work description
    werk_text = werkbon.get("uit_te_voeren_werk") or "-"
    materiaal_text = werkbon.get("nodige_materiaal") or "-"
    detail_table = Table([
        [Paragraph("<b>Uit te voeren werk</b>", styles["PBody"]), Paragraph("<b>Nodige materiaal</b>", styles["PBody"])],
        [Paragraph(werk_text.replace("\n", "<br/>"), styles["PBody"]), Paragraph(materiaal_text.replace("\n", "<br/>"), styles["PBody"])],
    ], colWidths=[85 * mm, 85 * mm])
    detail_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8f9fa")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([Paragraph("Werk details", styles["PSec"]), detail_table, Spacer(1, 8)])

    # PUR Production table
    totaal_m2 = werkbon.get("totaal_m2") or round(
        float(werkbon.get("gelijkvloers_m2") or 0) +
        float(werkbon.get("eerste_verdiep_m2") or 0) +
        float(werkbon.get("tweede_verdiep_m2") or 0), 2
    )
    pur_rows = [
        ["Verdiep", "M²", "CM Dikte"],
        ["Gelijkvloers", f"{werkbon.get('gelijkvloers_m2', 0)} m²", f"{werkbon.get('gelijkvloers_cm', 0)} cm"],
        ["1ste Verdiep", f"{werkbon.get('eerste_verdiep_m2', 0)} m²", f"{werkbon.get('eerste_verdiep_cm', 0)} cm"],
        ["2de Verdiep", f"{werkbon.get('tweede_verdiep_m2', 0)} m²", f"{werkbon.get('tweede_verdiep_cm', 0)} cm"],
        ["TOTAAL", f"{totaal_m2} m²", ""],
    ]
    pur_table = Table(pur_rows, colWidths=[60 * mm, 55 * mm, 55 * mm])
    pur_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(_accent)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (0, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([Paragraph("PUR Productie", styles["PSec"]), pur_table, Spacer(1, 8)])

    # Schuurwerken / Stofzuigen
    schuurwerken = werkbon.get("schuurwerken", False)
    stofzuigen = werkbon.get("stofzuigen", False)
    extra_rows = [["Type", "Status", "M²"],
        ["Schuurwerken", "Ja" if schuurwerken else "Nee", f"{werkbon.get('schuurwerken_m2', 0)} m²" if schuurwerken else "-"],
        ["Stofzuigen", "Ja" if stofzuigen else "Nee", f"{werkbon.get('stofzuigen_m2', 0)} m²" if stofzuigen else "-"],
    ]
    extra_table = Table(extra_rows, colWidths=[60 * mm, 55 * mm, 55 * mm])
    extra_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([Paragraph("Extra werkzaamheden", styles["PSec"]), extra_table, Spacer(1, 6)])

    if werkbon.get("opmerking"):
        story.append(Paragraph(f"<b>Opmerking:</b> {werkbon.get('opmerking', '').replace(chr(10), '<br/>')}", styles["PBody"]))
        story.append(Spacer(1, 8))

    # Work photos - 2-column grid layout, 4 photos max (2x2 per page)
    fotos = werkbon.get("fotos") or []
    if fotos:
        story.append(Paragraph("Werkfoto's", styles["PSec"]))
        # Collect all photo images with captions
        foto_cells = []
        for i, foto in enumerate(fotos[:3]):
            base64_data = foto.get("base64") if isinstance(foto, dict) else foto
            foto_ts = foto.get("timestamp", "") if isinstance(foto, dict) else ""
            foto_gps = foto.get("gps", "") if isinstance(foto, dict) else ""
            img = make_safe_reportlab_image(decode_base64_data(base64_data), 82 * mm, 108 * mm)
            caption_parts = [f"Foto {i + 1}"]
            if foto_ts:
                try:
                    ts_str = foto_ts[:16].replace("T", " ")
                    caption_parts.append(ts_str)
                except Exception:
                    pass
            if foto_gps:
                caption_parts.append(f"GPS: {foto_gps}")
            caption = Paragraph(" | ".join(caption_parts), styles["PSmall"])
            cell_content = [img, Spacer(1, 3), caption] if img else [caption]
            foto_cells.append(cell_content)
        # Build 2-column rows
        for row_idx in range(0, len(foto_cells), 2):
            if row_idx > 0 and row_idx % 4 == 0:
                story.append(PageBreak())
                story.append(Paragraph("Werkfoto's (vervolg)", styles["PSec"]))
            pair = foto_cells[row_idx:row_idx + 2]
            left_cell = pair[0]
            right_cell = pair[1] if len(pair) > 1 else [Spacer(82 * mm, 1)]
            photo_row_table = Table([[left_cell, right_cell]], colWidths=[86 * mm, 86 * mm])
            photo_row_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E9ED")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8E9ED")),
            ]))
            story.append(photo_row_table)
            story.append(Spacer(1, 8))

    # KM afstand
    for el in build_km_pdf_block(werkbon, styles, _secondary, _accent):
        story.append(el)

    # Signature section - Klanthandtekening with white background
    signer_name = werkbon.get("handtekening_naam") or "-"
    sign_date = werkbon.get("handtekening_datum") or "-"
    signature_bytes = decode_base64_data(werkbon.get("handtekening"))
    signature_image = make_safe_reportlab_image(signature_bytes, 80 * mm, 28 * mm)
    
    sig_content: list = [
        Paragraph("<b>Klanthandtekening</b>", styles["PSec"]),
        Paragraph(f"<b>Naam:</b> {signer_name}", styles["PBody"]),
        Paragraph(f"<b>Datum:</b> {str(sign_date)[:16]}", styles["PBody"]),
        Spacer(1, 4),
    ]
    if signature_image:
        # Create white background box for signature
        sig_box_table = Table([[signature_image]], colWidths=[82 * mm])
        sig_box_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        sig_content.append(sig_box_table)

    selfie_bytes = decode_base64_data(werkbon.get("selfie_foto"))
    selfie_img = make_safe_reportlab_image(selfie_bytes, 35 * mm, 35 * mm)
    if selfie_img:
        selfie_col: list = [Paragraph("<b>Selfie werknemer</b>", styles["PSmall"]), Spacer(1, 2), selfie_img]
        sig_table = Table([[sig_content, selfie_col]], colWidths=[125 * mm, 45 * mm])
    else:
        sig_table = Table([[sig_content]], colWidths=[170 * mm])
    sig_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    
    story.extend([sig_table, Spacer(1, 10)])
    
    # Legal text
    story.append(Paragraph(f"<i>{LEGAL_TEXT}</i>", styles["PLegal"]))
    story.append(Spacer(1, 6))
    
    # Footer
    footer_text = f"Digitale productie werkbon - {instellingen.get('bedrijfsnaam', 'Signybon')} - {instellingen.get('email', '')}"
    story.append(Paragraph(footer_text, styles["PSmall"]))
    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_productie_pdf_filename(werkbon)


async def send_productie_werkbon_email(werkbon: dict, instellingen: dict, pdf_bytes: bytes, pdf_filename: str, klant_email: Optional[str] = None, user_email: Optional[str] = None):
    """Send productie werkbon PDF email. Uses same async pattern as other mail functions."""
    # API key check - same as other mail functions
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping productie email")
        return {"success": False, "error": "Email not configured", "recipients": []}

    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen, user_email=user_email)
    klant_recipient = (klant_email or werkbon.get("klant_email_override") or "").strip() or None

    # Build recipients list - same pattern as other functions
    recipients = [company_recipient] if company_recipient else []
    if werkbon.get("verstuur_naar_klant") and klant_recipient:
        recipients = get_unique_recipients(company_recipient, klant_recipient)
    
    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}
    
    try:
        subject = f"Productie Werkbon PDF - {werkbon.get('werf_naam', 'Werf')} - {werkbon.get('datum', '')}"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto; }}
                .header {{ background: #1a1a2e; color: white; padding: 24px; text-align: center; border-bottom: 4px solid #F5A623; }}
                .header h1 {{ color: #F5A623; margin: 0; }}
                .content {{ padding: 24px; }}
                .info {{ background: #f8f9fa; border-left: 4px solid #F5A623; padding: 16px; margin: 18px 0; }}
                .footer {{ background: #f4f4f4; padding: 16px; font-size: 12px; color: #666; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{bedrijfsnaam}</h1>
                <p>Productie Werkbon</p>
            </div>
            <div class="content">
                <p>In bijlage vindt u de productie werkbon als PDF.</p>
                <div class="info">
                    <strong>Monteur:</strong> {werkbon.get('werknemer_naam') or werkbon.get('ingevuld_door_naam', '-')}<br/>
                    <strong>Klant:</strong> {werkbon.get('klant_naam', '-')}<br/>
                    <strong>Werf:</strong> {werkbon.get('werf_naam', '-')}<br/>
                    <strong>Datum:</strong> {werkbon.get('datum', '-')}<br/>
                    <strong>Totaal M²:</strong> {werkbon.get('totaal_m2', 0)} m²
                </div>
                <p>De volledige details vindt u in de bijgevoegde PDF.</p>
                <p>Met vriendelijke groeten,<br/><strong>{bedrijfsnaam}</strong></p>
            </div>
            <div class="footer">Dit is een automatisch gegenereerde e-mail van {bedrijfsnaam}.</div>
        </body>
        </html>
        """
        params = {
            "from": get_sender_email(instellingen),
            **({"reply_to": [get_reply_to(instellingen, user_email=user_email)]} if get_reply_to(instellingen, user_email=user_email) else {}),
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
            "to": recipients,
            "subject": subject,
            "html": html_body,
            "attachments": [{"filename": pdf_filename, "content": base64.b64encode(pdf_bytes).decode(), "contentType": "application/pdf"}],
        }
        # Use async pattern - same as other mail functions
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info("Productie email sent successfully: %s", result)
        return {"success": True, "email_id": result.get("id"), "recipients": recipients}
    except Exception as exc:
        logging.error("Failed to send productie email: %s", str(exc))
        return {"success": False, "error": str(exc), "recipients": recipients}


PROJECT_FEEDBACK_DEFAULTS = [
    "Werken uitgevoerd volgens planning",
    "Communicatie met klant was duidelijk",
    "Werf proper en veilig achtergelaten",
    "Afspraken correct nageleefd",
    "Klant tevreden over algemene prestatie",
]


def normalize_project_day_rows(data: ProjectWerkbonCreate | ProjectWerkbonUpdate | dict) -> tuple[list[dict], float]:
    if isinstance(data, dict):
        raw_rows = data.get("dag_regels") or []
        datum = data.get("datum") or ""
        start_tijd = data.get("start_tijd") or ""
        stop_tijd = data.get("stop_tijd") or ""
        pauze_minuten = data.get("pauze_minuten") or 0
    else:
        raw_rows = data.dag_regels or []
        datum = getattr(data, "datum", "")
        start_tijd = getattr(data, "start_tijd", "")
        stop_tijd = getattr(data, "stop_tijd", "")
        pauze_minuten = getattr(data, "pauze_minuten", 0) or 0

    if not raw_rows and datum and start_tijd and stop_tijd:
        raw_rows = [{
            "datum": datum,
            "start_tijd": start_tijd,
            "stop_tijd": stop_tijd,
            "pauze_minuten": pauze_minuten,
            "omschrijving": "",
        }]

    if not raw_rows:
        raise HTTPException(status_code=400, detail="Voeg minstens 1 werkdag toe")

    normalized_rows: list[dict] = []
    totaal = 0.0
    parsed_dates = []
    for row in raw_rows:
        datum_value = (row.get("datum") or "").strip()
        start_value = (row.get("start_tijd") or "").strip()
        stop_value = (row.get("stop_tijd") or "").strip()
        try:
            pauze_value = int(safe_float(row.get("pauze_minuten", 0)))
        except (ValueError, TypeError):
            pauze_value = 0
        dag_opmerking = (row.get("omschrijving") or row.get("opmerking") or "").strip()

        if not datum_value or not start_value or not stop_value:
            raise HTTPException(status_code=400, detail="Elke werkdag moet datum, startuur en stopuur hebben")

        try:
            parsed_date = datetime.strptime(datum_value, "%Y-%m-%d")
            parsed_dates.append(parsed_date)
            start_parts = start_value.split(":")
            stop_parts = stop_value.split(":")
            start_min = int(start_parts[0]) * 60 + int(start_parts[1])
            stop_min = int(stop_parts[0]) * 60 + int(stop_parts[1])
            uren = round(max(0, (stop_min - start_min - pauze_value) / 60), 2)
        except Exception:
            raise HTTPException(status_code=400, detail="Controleer datum en tijd formaat van de project werkbon")

        normalized_rows.append({
            "datum": datum_value,
            "start_tijd": start_value,
            "stop_tijd": stop_value,
            "pauze_minuten": pauze_value,
            "totaal_uren": uren,
            "omschrijving": dag_opmerking,
        })
        totaal += uren

    if parsed_dates:
        delta_days = (max(parsed_dates) - min(parsed_dates)).days
        if delta_days > 62:
            raise HTTPException(status_code=400, detail="Project werkbon mag maximaal 2 maanden bevatten")

    return normalized_rows, round(totaal, 2)


def normalize_project_feedback_items(items: Optional[list[dict]]) -> list[dict]:
    if not items:
        return [{"label": label, "checked": False} for label in PROJECT_FEEDBACK_DEFAULTS]
    normalized = []
    for index, item in enumerate(items[:5]):
        normalized.append({
            "label": (item.get("label") or PROJECT_FEEDBACK_DEFAULTS[index] if index < len(PROJECT_FEEDBACK_DEFAULTS) else f"Feedback {index + 1}").strip(),
            "checked": bool(item.get("checked")),
            "opmerking": (item.get("opmerking") or "").strip(),
        })
    return normalized


def build_project_pdf_filename(werkbon: dict) -> str:
    werf = (werkbon.get("werf_naam") or "werf").lower().replace(" ", "-")
    safe_werf = "".join(char for char in werf if char.isalnum() or char == "-") or "werf"
    return f"project-werkbon-{safe_werf}-{werkbon.get('datum', 'datum')}.pdf"


def generate_project_werkbon_pdf(werkbon: dict, instellingen: dict) -> tuple[bytes, str]:
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    # Dynamic brand colors from instellingen
    _C = get_pdf_colors(instellingen)
    _primary   = _C["primary"]
    _secondary = _C["secondary"]
    _accent    = _C["accent"]
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PJSection", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor(_secondary), spaceAfter=6, spaceBefore=6))
    styles.add(ParagraphStyle(name="PJBody", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="PJSmall", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    story = []

    # Logo OR bedrijfsnaam caps — also pulls branding.logo_url (the old direct
    # logo_base64 lookup missed URL-based logos uploaded via the new branding UI).
    bedrijfsnaam = instellingen.get("bedrijfsnaam") or "Signybon"
    header_left: list = [make_logo_or_brand_flowable(instellingen, 26 * mm, 18 * mm), Spacer(1, 3)]
    header_left.append(Paragraph(f"<b>{bedrijfsnaam}</b>", ParagraphStyle("PJCompany", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor(_secondary))))
    header_left.append(Paragraph(instellingen.get("email") or "", styles["PJSmall"]))
    header_right = [
        Paragraph("<b>PROJECT WERKBON</b>", ParagraphStyle("PJTitle", fontName="Helvetica-Bold", fontSize=16, textColor=colors.HexColor(_secondary), alignment=2)),
        Paragraph(f"Status: {(werkbon.get('status') or 'ondertekend').capitalize()}", styles["PJBody"]),
        Paragraph(f"Periode start: {(werkbon.get('dag_regels') or [{}])[0].get('datum', werkbon.get('datum', '-'))}", styles["PJBody"]),
    ]
    header = Table([[header_left, header_right]], colWidths=[90 * mm, 80 * mm])
    header.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(_accent)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([header, Spacer(1, 8)])

    info_table = Table([
        ["Klant", werkbon.get("klant_naam") or "-"],
        ["Werf", werkbon.get("werf_naam") or "-"],
        ["Adres", werkbon.get("werf_adres") or "-"],
        ["Monteur", werkbon.get("ingevuld_door_naam") or "-"],
        ["Totaal uren", f"{werkbon.get('totaal_uren', 0)} u"],
    ], colWidths=[42 * mm, 128 * mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.extend([Paragraph("Project info", styles["PJSection"]), info_table, Spacer(1, 8)])

    dag_rows = [["Datum", "Start", "Stop", "Pauze", "Uren", "Opmerking"]]
    for row in werkbon.get("dag_regels") or []:
        dag_rows.append([
            row.get("datum") or "-",
            row.get("start_tijd") or "-",
            row.get("stop_tijd") or "-",
            f"{row.get('pauze_minuten', 0)} min",
            f"{row.get('totaal_uren', 0)}",
            row.get("omschrijving") or "-",
        ])
    dag_table = Table(dag_rows, colWidths=[28 * mm, 18 * mm, 18 * mm, 20 * mm, 16 * mm, 70 * mm])
    dag_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_secondary)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.extend([Paragraph("Werkdagen", styles["PJSection"]), dag_table, Spacer(1, 8)])

    feedback_rows = [["Klant feedback", "Ja / Nee"]]
    for item in werkbon.get("klant_feedback_items") or []:
        feedback_rows.append([item.get("label") or "-", "Ja" if item.get("checked") else "Nee"])
    _score = min(3, max(0, int(safe_float(werkbon.get("klant_prestatie_score", 0)))))
    feedback_rows.append(["Algemene score", "★" * _score + "☆" * (3 - _score)])
    feedback_table = Table(feedback_rows, colWidths=[120 * mm, 50 * mm])
    feedback_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_accent)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.extend([Paragraph("Prestatie feedback", styles["PJSection"]), feedback_table, Spacer(1, 6)])
    story.append(Paragraph(f"<b>Extra feedback:</b> {(werkbon.get('klant_feedback_opmerking') or '-').replace(chr(10), '<br/>')}", styles["PJBody"]))
    story.append(Spacer(1, 8))

    work_desc = (werkbon.get("werk_beschrijving") or "-").replace("\n", "<br/>")
    notes = (werkbon.get("extra_opmerkingen") or "-").replace("\n", "<br/>")
    story.extend([
        Paragraph("Werkbeschrijving", styles["PJSection"]),
        Paragraph(work_desc, styles["PJBody"]),
        Spacer(1, 6),
        Paragraph("Extra opmerkingen", styles["PJSection"]),
        Paragraph(notes, styles["PJBody"]),
        Spacer(1, 10),
    ])

    # KM afstand
    for el in build_km_pdf_block(werkbon, styles, _secondary, _accent):
        story.append(el)

    confirmation_text = instellingen.get("project_confirmation_text") or "Hierbij bevestigt de klant dat deze ingevulde project werkbon juist is ingevuld."
    story.append(Paragraph(confirmation_text.replace("\n", "<br/>"), styles["PJBody"]))
    story.append(Spacer(1, 6))

    signer_name = werkbon.get("handtekening_klant_naam") or "-"
    signature_image = make_safe_reportlab_image(decode_base64_data(werkbon.get("handtekening_klant")), 80 * mm, 28 * mm)
    sig_box: list = [Paragraph(f"<b>Klant naam:</b> {signer_name}", styles["PJBody"])]
    if werkbon.get("handtekening_datum_str"):
        sig_box.append(Paragraph(f"<b>Ondertekend op:</b> {werkbon.get('handtekening_datum_str')}", styles["PJBody"]))
    if werkbon.get("gps_locatie"):
        sig_box.append(Paragraph(f"<b>GPS:</b> {werkbon.get('gps_locatie')}", styles["PJBody"]))
    if signature_image:
        sig_box.extend([Spacer(1, 4), signature_image])

    selfie_bytes_p = decode_base64_data(werkbon.get("selfie_foto"))
    selfie_img_p = make_safe_reportlab_image(selfie_bytes_p, 30 * mm, 30 * mm)
    if selfie_img_p:
        selfie_col_p: list = [Paragraph("<b>Selfie</b>", styles["PJSmall"]), selfie_img_p]
        sig_table = Table([[sig_box, selfie_col_p]], colWidths=[130 * mm, 40 * mm])
    else:
        sig_table = Table([[sig_box]], colWidths=[170 * mm])

    sig_table.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.extend([sig_table, Spacer(1, 8), Paragraph((instellingen.get("pdf_voettekst") or "Digitale project werkbon").replace("\n", "<br/>"), styles["PJSmall"])])

    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_project_pdf_filename(werkbon)


async def send_project_werkbon_email(werkbon: dict, instellingen: dict, pdf_bytes: bytes, pdf_filename: str, klant_email: Optional[str] = None, user_email: Optional[str] = None):
    if not resend.api_key:
        return {"success": False, "error": "Email not configured", "recipients": []}

    company_recipient = get_company_recipient(instellingen, user_email=user_email)
    # Klant email: explicit param > werkbon override. NO further fallback —
    # if the client has no address on file, the client copy is simply skipped.
    klant_recipient = (klant_email or werkbon.get("klant_email_override") or "").strip() or None
    recipients = [company_recipient] if company_recipient else []
    if werkbon.get("verstuur_naar_klant") and klant_recipient:
        recipients = get_unique_recipients(company_recipient, klant_recipient)
    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}

    subject = f"Project Werkbon PDF - {werkbon.get('werf_naam', 'Werf')}"
    html = f"""
    <div style='font-family:Arial,sans-serif;max-width:640px;margin:0 auto;'>
      <div style='background:#1a1a2e;color:#fff;padding:24px;border-bottom:4px solid #F5A623;'>
        <h1 style='margin:0;color:#F5A623;'>{instellingen.get('bedrijfsnaam') or 'Signybon'}</h1>
        <p style='margin:8px 0 0;'>Ondertekende project werkbon in bijlage</p>
      </div>
      <div style='padding:24px;'>
        <p>Klant: <strong>{werkbon.get('klant_naam') or '-'}</strong></p>
        <p>Werf: <strong>{werkbon.get('werf_naam') or '-'}</strong></p>
        <p>Totaal uren: <strong>{werkbon.get('totaal_uren', 0)} uur</strong></p>
      </div>
    </div>
    """
    try:
        params = {
            "from": get_sender_email(instellingen),
            **({"reply_to": [get_reply_to(instellingen, user_email=user_email)]} if get_reply_to(instellingen, user_email=user_email) else {}),
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
            "to": recipients,
            "subject": subject,
            "html": html,
            "attachments": [{
                "filename": pdf_filename,
                "content": base64.b64encode(pdf_bytes).decode(),
                "contentType": "application/pdf",
            }],
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        return {"success": True, "email_id": result.get("id"), "recipients": recipients}
    except Exception as e:
        return {"success": False, "error": str(e), "recipients": recipients}

class UserCreateWithEmail(BaseModel):
    email: str
    password: str
    naam: str
    rol: str = "werknemer"
    send_email: bool = False  # Whether to send welcome email

class CompanyRegister(BaseModel):
    bedrijfsnaam: str
    btw_nummer: str
    voornaam: str
    achternaam: str
    email: str
    wachtwoord: str
    pakket: str = "pro"
    telefoon: Optional[str] = None
    straat: Optional[str] = None
    huisnr: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    land: Optional[str] = "BE"

@api_router.post("/auth/register-company")
@limiter.limit("3/minute")
async def register_company(request: Request, data: CompanyRegister):
    """Register a new company + master_admin user. Sends verification email."""
    import re
    email = data.email.lower().strip()
    btw = data.btw_nummer.replace(" ", "").upper()

    # Validate BTW nummer
    if not re.match(r'^BE\d{10}$', btw):
        raise HTTPException(status_code=400, detail="Ongeldig BTW-nummer. Formaat: BE0123456789")

    # Check existing email
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al geregistreerd")

    if len(data.wachtwoord) < 8:
        raise HTTPException(status_code=400, detail="Wachtwoord moet minimaal 8 tekens bevatten")

    # Create company with trial subscription
    company_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=30)
    company = {
        "id": company_id,
        "bedrijfsnaam": data.bedrijfsnaam.strip(),
        "btw_nummer": btw,
        "email": email,
        "contact_email": email,
        "telefoon": data.telefoon or "",
        "pakket": data.pakket,
        "selected_plan": data.pakket,
        "subscription_status": "trial",
        "trial_start_date": now.isoformat(),
        "trial_end_date": trial_end.isoformat(),
        "created_at": now.isoformat(),
    }
    await db.companies.insert_one(company)

    # Create initial instellingen document with contact info
    instellingen_doc = {
        "id": "company_settings",
        "company_id": company_id,
        "bedrijfsnaam": data.bedrijfsnaam.strip(),
        "voornaam": data.voornaam.strip(),
        "achternaam": data.achternaam.strip(),
        "btw_nummer": btw,
        "email": email,
        "telefoon": data.telefoon or "",
        "adres_gestructureerd": {
            "straat": data.straat or "",
            "huisnummer": data.huisnr or "",
            "postcode": data.postcode or "",
            "stad": data.stad or "",
            "land": "België" if data.land == "BE" else "Nederland" if data.land == "NL" else (data.land or ""),
        },
        "created_at": now.isoformat(),
    }
    # Avoid overwriting existing default instellingen — only insert if not exists for this company
    existing_inst = await db.instellingen.find_one({"id": "company_settings", "company_id": company_id})
    if not existing_inst:
        try:
            await db.instellingen.insert_one(instellingen_doc)
        except Exception as e:
            logging.warning(f"Could not insert initial instellingen: {e}")

    # Create master_admin user
    naam = f"{data.voornaam.strip()} {data.achternaam.strip()}"
    verification_token = secrets.token_urlsafe(48)
    user = User(
        email=email,
        password_hash=hash_password(data.wachtwoord),
        naam=naam,
        rol="master_admin",
        company_id=company_id,
        actief=False,
    )
    user_dict = user.dict()
    user_dict["status"] = "pending_verification"
    user_dict["verification_token"] = verification_token
    await db.users.insert_one(user_dict)

    # Send verification email
    verify_url = f"{APP_URL}/api/auth/verify-email?token={verification_token}"
    if resend.api_key:
        try:
            html = f"""
            <!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body{{font-family:'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:620px;margin:0 auto;background:#f5f6fa}}
            .wrap{{background:#fff;border-radius:14px;overflow:hidden;margin:20px;box-shadow:0 4px 20px rgba(0,0,0,.08)}}
            .header{{background:#1B4332;color:#fff;padding:36px 30px;text-align:center}}
            .header h1{{color:#D4A017;margin:0;font-size:34px;font-weight:900;letter-spacing:1px}}
            .header p{{color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px}}
            .content{{padding:32px 36px;color:#1B4332}}
            .content h2{{font-size:22px;color:#1B4332;margin:0 0 12px}}
            .content .lead{{font-size:15px;color:#495057;margin-bottom:24px}}
            .btn-wrap{{text-align:center;margin:28px 0}}
            .btn{{display:inline-block;background:#1B4332;color:#fff !important;padding:16px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px}}
            .steps{{background:#f8f9fa;border-radius:12px;padding:22px 26px;margin-top:24px;border-left:4px solid #D4A017}}
            .steps h3{{color:#1B4332;font-size:16px;margin:0 0 14px}}
            .step{{margin:10px 0;font-size:14px;color:#495057;display:flex;align-items:flex-start;gap:10px}}
            .step-num{{display:inline-flex;align-items:center;justify-content:center;background:#D4A017;color:#1B4332;width:24px;height:24px;border-radius:50%;font-weight:800;font-size:12px;flex-shrink:0}}
            .footer{{background:#1B4332;padding:22px;text-align:center;font-size:12px;color:rgba(255,255,255,.7)}}
            </style></head><body>
            <div class="wrap">
              <div class="header">
                <h1>SIGNYBON</h1>
                <p>Het digitale werkbonplatform</p>
              </div>
              <div class="content">
                <h2>Hoera! Bedankt voor het kiezen van Signybon!</h2>
                <p class="lead">Welkom {naam}! Dankzij u helpt u het milieu — minder papier, meer digitaal. Bevestig hieronder uw e-mailadres om uw 30 dagen gratis proefperiode te starten.</p>
                <div class="btn-wrap">
                  <a href="{verify_url}" class="btn">E-mailadres Bevestigen</a>
                </div>
                <div class="steps">
                  <h3>🚀 Snel aan de slag in 6 stappen:</h3>
                  <div class="step"><span class="step-num">1</span><span><b>Bedrijfsgegevens invullen</b> — logo, kleuren, contactpersoon</span></div>
                  <div class="step"><span class="step-num">2</span><span><b>Klanten aanmaken</b> — uw vaste klanten eenmalig invoeren</span></div>
                  <div class="step"><span class="step-num">3</span><span><b>Werknemers toevoegen</b> — uw team uitnodigen via e-mail</span></div>
                  <div class="step"><span class="step-num">4</span><span><b>Werven aanmaken</b> — projecten/locaties koppelen aan klanten</span></div>
                  <div class="step"><span class="step-num">5</span><span><b>Planning maken</b> — wie, wat, waar en wanneer</span></div>
                  <div class="step"><span class="step-num">6</span><span><b>Eerste werkbon</b> — invullen, laten tekenen, automatisch verzonden</span></div>
                </div>
              </div>
              <div class="footer">Signybon \u2014 Digitale werkbonnen voor de bouwsector</div>
            </div>
            </body></html>"""
            await asyncio.to_thread(resend.Emails.send, {
                "from": f"Signybon <{SENDER_EMAIL}>",
                "to": [email],
                "subject": "Welkom bij Signybon — Bevestig uw e-mailadres",
                "html": html,
                "reply_to": ["info@signybon.com"],
                "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
            })
        except Exception as e:
            logging.error(f"Verification email failed: {e}")

    return {"message": "Registratie succesvol. Controleer uw e-mail.", "company_id": company_id}

@api_router.get("/auth/verify-email")
async def verify_email(token: str = Query(...)):
    """Verify email address and activate user account. Always redirects, never JSON."""
    from starlette.responses import RedirectResponse
    user = await db.users.find_one({"verification_token": token})
    if not user:
        # Token not found: maybe already used (already verified) or expired/invalid
        # Try to detect "already used" by checking if any active user matches a recently consumed token? Cannot — no record.
        return RedirectResponse(url="/login?verified=expired", status_code=302)
    if user.get("actief") and user.get("status") == "active":
        return RedirectResponse(url="/login?verified=already", status_code=302)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"actief": True, "status": "active"}, "$unset": {"verification_token": ""}}
    )
    return RedirectResponse(url="/login?verified=1", status_code=302)

@api_router.post("/auth/register", response_model=UserResponse)
@limiter.limit("3/minute")
async def register_user(request: Request, user_data: UserCreate):
    register_email = user_data.email.lower().strip()
    existing = await db.users.find_one({"email": register_email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al geregistreerd")

    # Check if this email should be admin
    is_admin_user = await is_admin(register_email)

    user = User(
        email=register_email,
        password_hash=hash_password(user_data.password),
        naam=user_data.naam,
        rol="admin" if is_admin_user else "werknemer"
    )
    await db.users.insert_one(user.dict())
    return UserResponse(**user.dict())

@api_router.post("/auth/register-worker")
async def register_worker_with_email(
    email: str,
    naam: str,
    password: Optional[str] = None,
    rol: str = "werknemer",
    team_id: Optional[str] = None,
    telefoon: Optional[str] = None,
    werkbon_types: Optional[str] = None,
    send_email: bool = False,
    current_user: Dict = Depends(require_roles(["admin", "master_admin"]))
):
    """Register a new worker. Only admin/master_admin can create users."""
    company_id = _require_tenant(current_user)
    _sub, plan, _co = await _resolve_company_plan(company_id)
    await _enforce_limit(
        company_id, plan, "werknemers", "users",
        {"rol": {"$in": ["werknemer", "worker", "onderaannemer", "planner"]}, "actief": True},
    )
    # Generate secure password server-side if not provided
    password = password or generate_temp_password()

    email = email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al geregistreerd")

    # Parse werkbon_types from comma-separated string
    wbt = ["uren"]
    if werkbon_types:
        wbt = [t.strip() for t in werkbon_types.split(",") if t.strip()]

    user = User(
        email=email,
        password_hash=hash_password(password),
        naam=naam,
        rol=rol,
        team_id=team_id,
        telefoon=telefoon,
        werkbon_types=wbt,
        company_id=_require_tenant(current_user),
    )
    await db.users.insert_one(user.dict())
    clear_cache("auth:users")

    email_result = {"success": False, "error": "E-mail verzenden staat uitgeschakeld"}
    if send_email:
        instellingen = await get_instellingen_for_company(current_user.get("company_id"))
        email_result = await send_welcome_email(email, naam, password, instellingen)
    
    return {
        "user": UserResponse(**user.dict()),
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "temp_password": password
    }


@api_router.post("/auth/users/{user_id}/resend-info", response_model=ResendInfoMailResponse)
async def resend_worker_info_email(user_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    company_id = _require_tenant(current_user)
    user = await db.users.find_one({"id": user_id, "company_id": company_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    # V1: admin check - admins cannot use this action
    if user.get("rol") == "admin" or user.get("rol") == "master_admin":
        raise HTTPException(status_code=400, detail="Voor admins is deze actie niet beschikbaar")

    # Generate new permanent password
    new_password = generate_temp_password()
    await db.users.update_one(
        {"id": user_id, "company_id": company_id},
        {"$set": {
            "password_hash": hash_password(new_password),
            "actief": True
        }},
    )

    instellingen = await get_instellingen_for_company(company_id)
    email_result = await send_welcome_email(user["email"], user["naam"], new_password, instellingen)
    updated_user = await db.users.find_one({"id": user_id, "company_id": company_id}, {"_id": 0})

    return ResendInfoMailResponse(
        user=UserResponse(**updated_user),
        email_sent=email_result.get("success", False),
        email_error=email_result.get("error"),
        temp_password=new_password,
    )

@api_router.post("/auth/login")
@limiter.limit("5/minute")
async def login_user(request: Request, login_data: UserLogin):
    """
    Login endpoint with JWT token and platform access info.
    Returns JWT token for authenticated requests.
    """
    login_email = login_data.email.lower().strip()
    logger.info(f"[LOGIN] Giriş denemesi: {login_email}")
    user = await db.users.find_one({"email": login_email})
    if not user:
        logger.warning(f"[LOGIN] Kullanıcı bulunamadı: {login_email}")
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")

    logger.info(f"[LOGIN] Kullanıcı bulundu: {user.get('naam')}")

    # Try password_hash first, then fall back to plain text comparison (legacy migration)
    authenticated = False
    if user.get("password_hash"):
        computed = hash_password(login_data.password)
        authenticated = verify_password(login_data.password, user["password_hash"])
        logger.info(f"[LOGIN] Giriş {'başarılı' if authenticated else 'başarısız'}: {login_email}")
    
    # Fallback: compare with wachtwoord_plain directly (legacy support)
    if not authenticated and user.get("wachtwoord_plain"):
        authenticated = (login_data.password == user["wachtwoord_plain"])
        # If matched via plain text, create the hash and remove plain password
        if authenticated:
            await db.users.update_one(
                {"id": user["id"]},
                {
                    "$set": {"password_hash": hash_password(login_data.password)},
                    "$unset": {"wachtwoord_plain": ""}  # Remove plain password
                }
            )
    
    if not authenticated:
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    if not user.get("actief", True):
        raise HTTPException(status_code=401, detail="Account is gedeactiveerd")
    
    # Normalize role using new role system
    normalized_role = normalize_role(user.get("rol", "worker"))

    # Hardcoded platform owner — always force platform_admin
    if login_email == PLATFORM_ADMIN_EMAIL:
        normalized_role = "platform_admin"

    # Update role in database if it was mapped or upgraded
    if normalized_role != user.get("rol"):
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"rol": normalized_role}}
        )
        user["rol"] = normalized_role

    # Check admin_emails setting for admin role (skip for platform_admin)
    if normalized_role != "platform_admin":
        is_admin_user = await is_admin(login_email)
        if is_admin_user and normalized_role != "admin" and normalized_role != "master_admin":
            await db.users.update_one({"id": user["id"]}, {"$set": {"rol": "admin"}})
            user["rol"] = "admin"
            normalized_role = "admin"
    
    # Determine platform access - use database values if set, otherwise calculate from role
    db_web_access = user.get("web_access")
    db_app_access = user.get("app_access")
    
    # If explicitly set in database, use those values; otherwise fall back to role-based calculation
    web_access = db_web_access if db_web_access is not None else has_web_access(normalized_role)
    app_access = db_app_access if db_app_access is not None else has_app_access(normalized_role)
    
    if web_access and app_access:
        platform = "both"
    elif web_access:
        platform = "web"
    else:
        platform = "app"
    
    # Create JWT token
    company_id = user.get("company_id", "default_company")
    token = create_jwt_token(user["id"], user["email"], normalized_role, company_id)
    
    # Build user response
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        naam=user.get("naam", ""),
        rol=normalized_role,
        company_id=company_id,
        team_id=user.get("team_id"),
        telefoon=user.get("telefoon"),
        actief=user.get("actief", True),
        werkbon_types=user.get("werkbon_types", ["uren"]),
        mag_wachtwoord_wijzigen=user.get("mag_wachtwoord_wijzigen", True),
        must_change_password=user.get("must_change_password", False),
        web_access=web_access,
        app_access=app_access,
    )
    
    # Subscription / trial / plan info
    subscription, plan, _co = await _resolve_company_plan(company_id)
    plan_info = await _build_plan_info(company_id, plan, subscription)

    return {
        "user": user_response.dict(),
        "token": token,
        "platform_access": platform,
        "valid_roles": list(VALID_ROLES),
        "subscription": subscription,
        "plan_info": plan_info,
    }

@api_router.get("/subscription/status")
async def subscription_status(current_user: Dict = Depends(get_current_user)):
    """Returns current company's subscription/trial status."""
    company_id = current_user.get("company_id", "default_company")
    return await get_company_subscription_status(company_id)


async def _build_plan_info(company_id: str, plan: str, subscription: dict) -> dict:
    """Bundle limits + features + current usage for the calling tenant."""
    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["basic"])
    features = PLAN_FEATURES.get(plan, PLAN_FEATURES["basic"])
    if not company_id or company_id == "default_company":
        usage = {"werknemers": 0, "klanten": 0, "werven": 0}
    else:
        usage = {
            "werknemers": await db.users.count_documents(
                {"company_id": company_id, "rol": {"$in": ["werknemer", "worker", "onderaannemer", "planner"]}, "actief": True}
            ),
            "klanten": await db.klanten.count_documents(
                {"company_id": company_id, "actief": {"$ne": False}}
            ),
            "werven": await db.werven.count_documents(
                {"company_id": company_id, "actief": True}
            ),
        }
    return {
        "plan": plan,
        "plan_source": subscription.get("plan_source"),
        "limits": limits,
        "features": features,
        "usage": usage,
        "subscription": subscription,
    }


@api_router.get("/subscription/plan-info")
async def subscription_plan_info(current_user: Dict = Depends(get_current_user)):
    """Returns plan, limits, features and current usage for the caller's tenant."""
    company_id = _require_tenant(current_user)
    sub, plan, _co = await _resolve_company_plan(company_id)
    return await _build_plan_info(company_id, plan, sub)


class SelfPlanSelectBody(BaseModel):
    plan: str  # "basic" or "pro"


@api_router.post("/subscription/select-plan")
async def subscription_select_plan(
    body: SelfPlanSelectBody,
    current_user: Dict = Depends(require_roles(["admin", "master_admin"])),
):
    """Customer-facing plan selection. Only basic/pro — free is master-panel only."""
    plan = (body.plan or "").lower().strip()
    if plan not in ("basic", "pro"):
        raise HTTPException(status_code=400, detail="Ongeldig plan — kies 'basic' of 'pro'")
    company_id = current_user.get("company_id")
    if not company_id or company_id == "default_company":
        raise HTTPException(status_code=400, detail="Bedrijf ontbreekt")
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "subscription_status": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    if (company.get("subscription_status") or "").lower() == "blocked":
        raise HTTPException(status_code=403, detail="Account is geblokkeerd")
    new_status = f"active_{plan}"
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"selected_plan": plan, "pakket": plan, "subscription_status": new_status}},
    )
    sub, _eff_plan, _co = await _resolve_company_plan(company_id)
    return {"ok": True, "plan": plan, "status": new_status, "subscription": sub}

@api_router.get("/auth/users", response_model=List[UserResponse])
async def get_all_users(current_user: Dict = Depends(require_web_access())):
    """Get all users. Only web panel users can access."""
    company_id = _require_tenant(current_user)
    cache_key = f"auth:users:{company_id}"
    cached = get_cache(cache_key, ttl_seconds=60)
    if cached is not None:
        return cached
    users = await db.users.find(_company_scope_query(company_id)).to_list(1000)
    result = []
    for user in users:
        normalized_role = normalize_role(user.get("rol", "worker"))
        result.append(UserResponse(
            id=user["id"],
            email=user["email"],
            naam=user.get("naam", ""),
            rol=normalized_role,
            company_id=user.get("company_id", "default_company"),
            team_id=user.get("team_id"),
            telefoon=user.get("telefoon"),
            actief=user.get("actief", True),
            werkbon_types=user.get("werkbon_types", ["uren"]),
            mag_wachtwoord_wijzigen=user.get("mag_wachtwoord_wijzigen", True),
            must_change_password=user.get("must_change_password", False),
            web_access=has_web_access(normalized_role),
            app_access=has_app_access(normalized_role),
            push_token=user.get("push_token"),
        ))
    set_cache(cache_key, result)
    return result

@api_router.put("/auth/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, update_data: UserUpdate, current_user: Dict = Depends(get_current_user)):
    """Update user. Tenant-scoped — admins can only update users in their own company."""
    company_id = _require_tenant(current_user)
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="Geen wijzigingen opgegeven")

    # Handle new_password field (replaces wachtwoord_plain)
    if "new_password" in update_dict and update_dict["new_password"]:
        update_dict["password_hash"] = hash_password(update_dict["new_password"])
        update_dict["password_changed_at"] = datetime.now(timezone.utc)
        del update_dict["new_password"]

    # Normalize role if being updated
    if "rol" in update_dict:
        update_dict["rol"] = normalize_role(update_dict["rol"])

    result = await db.users.update_one({"id": user_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    clear_cache("auth:users")
    updated = await db.users.find_one({"id": user_id, "company_id": company_id})
    normalized_role = normalize_role(updated.get("rol", "worker"))
    return UserResponse(
        id=updated["id"],
        email=updated["email"],
        naam=updated.get("naam", ""),
        rol=normalized_role,
        company_id=updated.get("company_id", "default_company"),
        team_id=updated.get("team_id"),
        telefoon=updated.get("telefoon"),
        actief=updated.get("actief", True),
        werkbon_types=updated.get("werkbon_types", ["uren"]),
        mag_wachtwoord_wijzigen=updated.get("mag_wachtwoord_wijzigen", True),
        must_change_password=updated.get("must_change_password", False),
        web_access=has_web_access(normalized_role),
        app_access=has_app_access(normalized_role),
    )

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@api_router.post("/auth/change-password")
@limiter.limit("5/minute")
async def change_password(request: Request, user_id: str, password_data: PasswordChangeRequest):
    """
    Secure password change endpoint.
    Requires current password verification.
    No plain password storage.
    """
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    # Validate new password matches confirmation
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(status_code=400, detail="Nieuwe wachtwoorden komen niet overeen")
    
    # Validate password length
    if len(password_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Wachtwoord moet minimaal 8 karakters bevatten")
    
    # Verify current password
    authenticated = False
    if user.get("password_hash"):
        authenticated = verify_password(password_data.current_password, user["password_hash"])
    # Legacy fallback
    if not authenticated and user.get("wachtwoord_plain"):
        authenticated = (password_data.current_password == user["wachtwoord_plain"])
    
    if not authenticated:
        raise HTTPException(status_code=401, detail="Huidig wachtwoord is onjuist")
    
    # Update password hash only, remove any plain password
    new_hash = hash_password(password_data.new_password)
    await db.users.update_one(
        {"id": user_id}, 
        {
            "$set": {
                "password_hash": new_hash,
                "password_changed_at": datetime.now(timezone.utc),
                "must_change_password": False,
            },
            "$unset": {"wachtwoord_plain": ""}  # Remove plain password if exists
        }
    )
    
    return {"message": "Wachtwoord succesvol gewijzigd", "success": True}

@api_router.post("/auth/admin-reset-password/{user_id}")
async def admin_reset_password(user_id: str, data: dict, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """
    Admin endpoint to reset user password — tenant-scoped.
    Only admins of the same tenant can reset.
    """
    company_id = _require_tenant(current_user)
    new_password = data.get("new_password")
    if not new_password:
        raise HTTPException(status_code=400, detail="Nieuw wachtwoord is verplicht")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Wachtwoord moet minimaal 6 karakters bevatten")

    user = await db.users.find_one({"id": user_id, "company_id": company_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    # Hash the new password
    new_hash = hash_password(new_password)

    await db.users.update_one(
        {"id": user_id, "company_id": company_id},
        {
            "$set": {
                "password_hash": new_hash,
                "password_changed_at": datetime.now(timezone.utc),
            }
        }
    )

    return {"message": "Wachtwoord succesvol gewijzigd", "success": True, "new_password": new_password}

@api_router.get("/auth/user-password/{user_id}")
async def get_user_password(user_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """
    Admin endpoint to get user's plain password (if available) — tenant-scoped.
    """
    company_id = _require_tenant(current_user)
    user = await db.users.find_one({"id": user_id, "company_id": company_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    plain_password = user.get("wachtwoord_plain")
    
    return {
        "user_id": user_id,
        "naam": user.get("naam"),
        "email": user.get("email"),
        "wachtwoord": plain_password or "(niet beschikbaar - hash only)",
        "has_plain_password": bool(plain_password)
    }

# ==================== ROLE INFO ENDPOINT ====================

@api_router.get("/auth/roles")
async def get_role_info():
    """
    Get role information for UI dropdowns and validation.
    Returns all valid roles, their permissions, and platform access rules.
    """
    roles_info = []
    for role in VALID_ROLES:
        role_data = {
            "id": role,
            "name": role.replace("_", " ").title(),
            "web_access": role in WEB_PANEL_ROLES,
            "app_access": role in MOBILE_APP_ROLES,
            "permissions": ROLE_PERMISSIONS.get(role, {}),
            "can_assign": list(ROLE_ASSIGNMENT_PERMISSIONS.get(role, set())),
        }
        roles_info.append(role_data)
    
    return {
        "roles": roles_info,
        "web_panel_roles": list(WEB_PANEL_ROLES),
        "mobile_app_roles": list(MOBILE_APP_ROLES),
    }

@api_router.put("/auth/users/{user_id}/role")
async def assign_user_role(
    user_id: str,
    role_data: dict,
    assigner_id: str = Query(..., description="ID of user assigning the role"),
    current_user: Dict = Depends(get_current_user),
):
    """
    Securely assign a role to a user.
    Validates that the assigner has permission to assign the requested role and
    that both assigner and target belong to the caller's tenant.
    """
    company_id = _require_tenant(current_user)
    new_role = role_data.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="Rol is vereist")

    # Normalize and validate new role
    normalized_new_role = normalize_role(new_role)
    if normalized_new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Ongeldige rol: {new_role}")

    # Get assigner user (must be in caller's tenant)
    assigner = await db.users.find_one({"id": assigner_id, "company_id": company_id})
    if not assigner:
        raise HTTPException(status_code=404, detail="Toewijzer niet gevonden")

    assigner_role = normalize_role(assigner.get("rol", "worker"))

    # Check if assigner can assign this role
    if not can_assign_role(assigner_role, normalized_new_role):
        raise HTTPException(
            status_code=403,
            detail=f"Geen toestemming om rol '{normalized_new_role}' toe te wijzen. "
                   f"Uw rol ({assigner_role}) kan alleen deze rollen toewijzen: "
                   f"{', '.join(ROLE_ASSIGNMENT_PERMISSIONS.get(assigner_role, set()))}"
        )

    # Get target user (must be in caller's tenant)
    target_user = await db.users.find_one({"id": user_id, "company_id": company_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    # Update role
    await db.users.update_one(
        {"id": user_id, "company_id": company_id},
        {"$set": {"rol": normalized_new_role}}
    )
    clear_cache("auth:users")
    updated = await db.users.find_one({"id": user_id, "company_id": company_id})
    return UserResponse(
        id=updated["id"],
        email=updated["email"],
        naam=updated.get("naam", ""),
        rol=normalized_new_role,
        company_id=updated.get("company_id", "default_company"),
        team_id=updated.get("team_id"),
        telefoon=updated.get("telefoon"),
        actief=updated.get("actief", True),
        werkbon_types=updated.get("werkbon_types", ["uren"]),
        mag_wachtwoord_wijzigen=updated.get("mag_wachtwoord_wijzigen", True),
        must_change_password=updated.get("must_change_password", False),
        web_access=has_web_access(normalized_new_role),
        app_access=has_app_access(normalized_new_role),
    )

@api_router.delete("/auth/users/{user_id}")
async def delete_user(user_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin", "platform_admin"]))):
    """Delete a user. admin/master_admin scoped to their own tenant; platform_admin can delete across tenants."""
    is_platform_admin = current_user.get("rol") == "platform_admin"
    if is_platform_admin:
        scope = {"id": user_id}
    else:
        company_id = _require_tenant(current_user)
        scope = {"id": user_id, "company_id": company_id}

    user = await db.users.find_one(scope)
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    # V1: Protect admin and master_admin from deletion (platform_admin overrides)
    if not is_platform_admin and user.get("rol") in ("admin", "master_admin"):
        raise HTTPException(status_code=400, detail="Admin gebruikers kunnen niet worden verwijderd")

    result = await db.users.delete_one(scope)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    clear_cache("auth:users")
    return {"message": "Gebruiker verwijderd"}

@api_router.post("/auth/users/{user_id}/push-token")
async def save_push_token(user_id: str, data: dict):
    """Save push notification token for a user"""
    push_token = data.get("push_token")
    if not push_token:
        raise HTTPException(status_code=400, detail="Push token is vereist")

    logging.info(f"[PUSH] Saving push token for user {user_id}: {push_token[:30]}...")

    result = await db.users.update_one({"id": user_id}, {"$set": {"push_token": push_token}})

    logging.info(f"[PUSH] Update result: matched={result.matched_count}, modified={result.modified_count}")

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Gebruiker met id {user_id} niet gevonden")

    return {"message": "Push token opgeslagen", "matched": result.matched_count, "modified": result.modified_count}

@api_router.delete("/auth/users/{user_id}/push-token")
async def remove_push_token(user_id: str, current_user: Dict = Depends(get_current_user)):
    """Remove push notification token for a user (called on logout)"""
    await db.users.update_one({"id": user_id}, {"$set": {"push_token": None}})
    logging.info(f"[PUSH] Push token cleared for user {user_id}")
    return {"message": "Push token verwijderd"}

async def send_push_notifications(user_ids: list, title: str, body: str, data: dict = None):
    """Send push notifications to users via Expo Push Service"""
    import httpx
    try:
        tokens = []
        async for user in db.users.find({"id": {"$in": user_ids}, "push_token": {"$ne": None}}, {"push_token": 1}):
            if user.get("push_token"):
                tokens.append(user["push_token"])

        if not tokens:
            logging.warning(f"[PUSH] No push tokens found for user_ids: {user_ids}")
            return {"sent": 0, "message": "No push tokens found"}

        logging.info(f"[PUSH] Sending '{title}' to {len(tokens)} device(s)")

        messages = [
            {
                "to": t,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "channelId": (data or {}).get("type", "default"),
            }
            for t in tokens
        ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
            )

        logging.info(f"[PUSH] Expo response status: {response.status_code}")

        try:
            result_data = response.json()
            tickets = result_data.get("data", [])
            error_count = 0
            for i, ticket in enumerate(tickets):
                if ticket.get("status") == "error":
                    error_count += 1
                    err_detail = ticket.get("details", {}).get("error", "unknown")
                    logging.error(
                        f"[PUSH] ERROR ticket[{i}] token={tokens[i][:30]}...: "
                        f"{ticket.get('message')} (error={err_detail})"
                    )
                    # Auto-clear invalid/unregistered tokens so we don't waste calls
                    if err_detail in ("DeviceNotRegistered", "InvalidCredentials"):
                        await db.users.update_one(
                            {"push_token": tokens[i]},
                            {"$set": {"push_token": None}}
                        )
                        logging.warning(f"[PUSH] Cleared invalid push token from DB (err={err_detail})")
                else:
                    logging.info(f"[PUSH] OK ticket[{i}]: {ticket.get('id')}")
            if error_count:
                logging.error(f"[PUSH] {error_count}/{len(tickets)} tickets had errors")
        except Exception as parse_err:
            logging.warning(f"[PUSH] Could not parse Expo response body: {parse_err}")

        return {"sent": len(tokens), "message": "Push notifications sent"}
    except Exception as e:
        logging.error(f"[PUSH] Error sending push notifications: {e}")
        return {"sent": 0, "error": str(e)}

# Push notification API endpoint
@api_router.post("/notifications/send")
async def send_notification_api(data: dict):
    """Send push notification to specific user(s)"""
    user_id = data.get("user_id")
    title = data.get("title", "Nieuw bericht")
    body = data.get("body", "")
    notification_data = data.get("data", {})
    
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    user_ids = [user_id] if isinstance(user_id, str) else user_id
    result = await send_push_notifications(user_ids, title, body, notification_data)
    return result

# ==================== TEAM ROUTES ====================

@api_router.get("/teams", response_model=List[Team])
async def get_teams(current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    cache_key = f"teams:active:{company_id}"
    cached = get_cache(cache_key, ttl_seconds=60)
    if cached is not None:
        return cached
    teams = await db.teams.find(_company_scope_query(company_id, {"actief": True})).to_list(1000)
    result = [Team(**team) for team in teams]
    set_cache(cache_key, result)
    return result

@api_router.get("/teams/{team_id}", response_model=Team)
async def get_team(team_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    team = await db.teams.find_one({"id": team_id, "actief": True, "company_id": company_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    return Team(**team)

@api_router.post("/teams", response_model=Team)
async def create_team(team_data: TeamCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create a new team. Only admin/master_admin can create teams."""
    team = Team(**team_data.dict())
    team_dict = team.dict()
    team_dict["company_id"] = _require_tenant(current_user)
    await db.teams.insert_one(team_dict)
    clear_cache("teams")
    return team

@api_router.put("/teams/{team_id}", response_model=Team)
async def update_team(team_id: str, team_data: TeamUpdate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update a team. Only admin/master_admin can update teams."""
    company_id = _require_tenant(current_user)
    update_dict = {k: v for k, v in team_data.dict().items() if v is not None}
    result = await db.teams.update_one({"id": team_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    updated = await db.teams.find_one({"id": team_id, "company_id": company_id})
    clear_cache("teams")
    return Team(**updated)

@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete a team. Only admin/master_admin can delete teams."""
    company_id = _require_tenant(current_user)
    result = await db.teams.update_one({"id": team_id, "company_id": company_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    clear_cache("teams")
    return {"message": "Team verwijderd"}

# ==================== KLANT ROUTES ====================

@api_router.get("/klanten", response_model=List[dict])
async def get_klanten(include_inactive: bool = Query(False), current_user: Dict = Depends(get_current_user)):
    """Get all klanten with migration to new structure (company-scoped)"""
    company_id = _require_tenant(current_user)
    cache_key = f"klanten:{company_id}:{'all' if include_inactive else 'active'}"
    cached = get_cache(cache_key, ttl_seconds=60)
    if cached is not None:
        return cached
    query: dict = {"company_id": company_id}
    if not include_inactive:
        query["actief"] = {"$ne": False}
    klanten = await db.klanten.find(query).to_list(1000)
    result = [migrate_klant_data(klant) for klant in klanten]
    set_cache(cache_key, result)
    return result

@api_router.get("/klanten/{klant_id}")
async def get_klant(klant_id: str, current_user: Dict = Depends(get_current_user)):
    """Get single klant by ID (company-scoped)"""
    company_id = _require_tenant(current_user)
    klant = await db.klanten.find_one({"id": klant_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    return migrate_klant_data(klant)

@api_router.post("/klanten", response_model=dict)
async def create_klant(klant_data: KlantCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create new klant with auto-generated klantnummer - Admin/Master Admin only"""
    company_id_for_limit = _require_tenant(current_user)
    _sub, plan, _co = await _resolve_company_plan(company_id_for_limit)
    await _enforce_limit(company_id_for_limit, plan, "klanten", "klanten", {"actief": {"$ne": False}})
    klant_dict = klant_data.dict()
    
    # Handle legacy field mapping
    if klant_dict.get("naam") and not klant_dict.get("bedrijfsnaam"):
        klant_dict["bedrijfsnaam"] = klant_dict["naam"]
    if klant_dict.get("email") and not klant_dict.get("algemeen_email"):
        klant_dict["algemeen_email"] = klant_dict["email"]
    if klant_dict.get("telefoon") and not klant_dict.get("algemeen_telefoon"):
        klant_dict["algemeen_telefoon"] = klant_dict["telefoon"]
    if klant_dict.get("uurtarief") and not klant_dict.get("standaard_uurtarief"):
        klant_dict["standaard_uurtarief"] = klant_dict["uurtarief"]
    
    # Ensure naam field matches bedrijfsnaam for backward compat
    klant_dict["naam"] = klant_dict.get("bedrijfsnaam", "")
    klant_dict["email"] = klant_dict.get("algemeen_email", "")
    
    # Generate klantnummer
    klant_dict["klantnummer"] = await generate_klantnummer(db)
    
    # Set defaults
    klant_dict["id"] = str(uuid.uuid4())
    klant_dict["company_id"] = company_id_for_limit
    klant_dict["actief"] = True
    klant_dict["created_at"] = datetime.now(timezone.utc)
    
    # Ensure adres_structured exists
    if not klant_dict.get("adres_structured"):
        klant_dict["adres_structured"] = {
            "straat": "", "huisnummer": "", "bus": "",
            "postcode": "", "stad": "", "land": "België"
        }
    
    await db.klanten.insert_one(klant_dict)
    clear_cache("klanten")
    return migrate_klant_data(klant_dict)

@api_router.put("/klanten/{klant_id}", response_model=dict)
async def update_klant(klant_id: str, klant_data: dict, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update klant - accepts full klant object - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    existing = await db.klanten.find_one({"id": klant_id, "company_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")

    # Merge with existing data
    update_dict = {**existing, **klant_data}

    # Ensure tenant ownership cannot be changed via payload
    update_dict["company_id"] = company_id

    # Ensure naam/email stay synced with new fields for backward compat
    if update_dict.get("bedrijfsnaam"):
        update_dict["naam"] = update_dict["bedrijfsnaam"]
    if update_dict.get("algemeen_email"):
        update_dict["email"] = update_dict["algemeen_email"]

    update_dict["updated_at"] = datetime.now(timezone.utc)

    # Remove MongoDB _id if present
    update_dict.pop("_id", None)

    await db.klanten.replace_one({"id": klant_id, "company_id": company_id}, update_dict)
    clear_cache("klanten")
    return migrate_klant_data(update_dict)

@api_router.delete("/klanten/{klant_id}")
async def delete_klant(klant_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete (deactivate) klant - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    result = await db.klanten.update_one({"id": klant_id, "company_id": company_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    clear_cache("klanten")
    return {"message": "Klant verwijderd"}

@api_router.get("/klanten/contact-functies")
async def get_contact_functies():
    """Get predefined contact function suggestions"""
    return {"functies": CONTACT_FUNCTIE_SUGGESTIONS}

@api_router.get("/klanten/prijs-modellen")
async def get_prijs_modellen():
    """Get available pricing models"""
    return {"modellen": PRIJS_MODELLEN}

@api_router.post("/klanten/{klant_id}/send-welcome-email")
async def send_klant_welcome(klant_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Send a welcome email to a client - Admin/Master Admin only. Strict
    tenant scope on both the klant lookup AND the instellingen used to brand
    the email, so the message goes out under the sender's identity — not some
    other tenant's logo/colors."""
    company_id = _require_tenant(current_user)
    klant = await db.klanten.find_one({"id": klant_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")

    # Use new field with fallback to legacy
    email = klant.get("algemeen_email") or klant.get("email")
    naam = klant.get("bedrijfsnaam") or klant.get("naam")

    if not email:
        raise HTTPException(status_code=400, detail="Klant heeft geen e-mailadres")

    instellingen = await get_instellingen_for_company(company_id)
    result = await send_klant_welcome_email(email, naam, instellingen)
    return {"email_sent": result.get("success", False), "error": result.get("error")}

# ==================== WERF ROUTES ====================

def _company_scope_query(company_id: Optional[str], base: Optional[dict] = None) -> dict:
    """Strict tenant scoping. Returns a query that ONLY matches documents whose
    company_id equals the supplied value. No legacy fallback — a missing
    company_id field on a document means it belongs to no one and must not leak.

    Defensive guard: if the caller passes a falsy company_id we raise 403 instead
    of building a `{"company_id": None}` query — that filter would match every
    legacy doc without a company_id field and silently leak data."""
    if not company_id:
        raise HTTPException(
            status_code=403,
            detail="Geen company_id — toegang geweigerd",
        )
    base = dict(base or {})
    base["company_id"] = company_id
    return base

@api_router.get("/werven", response_model=List[Werf])
async def get_werven(current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    cache_key = f"werven:active:{company_id}"
    cached = get_cache(cache_key, ttl_seconds=60)
    if cached is not None:
        return cached
    werven = await db.werven.find(_company_scope_query(company_id, {"actief": True})).to_list(1000)
    result = [Werf(**werf) for werf in werven]
    set_cache(cache_key, result)
    return result

@api_router.get("/werven/klant/{klant_id}", response_model=List[Werf])
async def get_werven_by_klant(klant_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    werven = await db.werven.find(_company_scope_query(company_id, {"klant_id": klant_id, "actief": True})).to_list(1000)
    return [Werf(**werf) for werf in werven]

@api_router.post("/werven", response_model=Werf)
async def create_werf(werf_data: WerfCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create new werf - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    _sub, plan, _co = await _resolve_company_plan(company_id)
    await _enforce_limit(company_id, plan, "werven", "werven", {"actief": True})
    klant = await db.klanten.find_one({"id": werf_data.klant_id, "actief": True})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if klant.get("company_id") and klant.get("company_id") != company_id:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    werf = Werf(**werf_data.dict())
    werf_dict = werf.dict()
    werf_dict["company_id"] = company_id
    await db.werven.insert_one(werf_dict)
    clear_cache("werven")
    return werf

@api_router.put("/werven/{werf_id}", response_model=Werf)
async def update_werf(werf_id: str, werf_data: WerfCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update werf - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    update_dict = werf_data.dict()
    # Validate the optional klant_id targets a klant in same tenant
    if update_dict.get("klant_id"):
        klant = await db.klanten.find_one({"id": update_dict["klant_id"], "company_id": company_id, "actief": True})
        if not klant:
            raise HTTPException(status_code=404, detail="Klant niet gevonden")
    result = await db.werven.update_one({"id": werf_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    updated = await db.werven.find_one({"id": werf_id, "company_id": company_id})
    clear_cache("werven")
    return Werf(**updated)

@api_router.delete("/werven/{werf_id}")
async def delete_werf(werf_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete (deactivate) werf - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    result = await db.werven.update_one({"id": werf_id, "company_id": company_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    clear_cache("werven")
    return {"message": "Werf verwijderd"}

# ==================== USER SEARCH ====================

@api_router.get("/users/search")
async def search_users(q: str = Query(""), rol: Optional[str] = Query(None), current_user: Dict = Depends(get_current_user)):
    """Search werknemers and onderaannemers by name. Empty q returns all matching rol."""
    if rol == "werknemer":
        rol_filter = {"$in": ["werknemer", "worker"]}
    elif rol == "onderaannemer":
        rol_filter = "onderaannemer"
    else:
        rol_filter = {"$in": ["werknemer", "worker", "onderaannemer"]}
    company_id = current_user.get("company_id")
    query: Dict[str, Any] = {"rol": rol_filter, "actief": True, "company_id": company_id}
    if q:
        query["naam"] = {"$regex": q, "$options": "i"}
    cursor = db.users.find(query, {"_id": 0, "id": 1, "naam": 1, "rol": 1}).limit(50)
    users = await cursor.to_list(50)
    return users

# ==================== WERKBON ROUTES ====================

def _werkbonnen_admin_filter_query(
    week_nummer: Optional[int],
    jaar: Optional[int],
    maand: Optional[int],
) -> Dict:
    """Build Mongo filter for admin werkbonnen list (calendar jaar + ISO week numbers)."""
    import calendar
    if week_nummer is not None and jaar is not None:
        return {"week_nummer": week_nummer, "jaar": jaar}
    if maand is not None and jaar is not None:
        weeks_set = set()
        _, num_days = calendar.monthrange(jaar, maand)
        for day in range(1, num_days + 1):
            d = datetime(jaar, maand, day)
            weeks_set.add(d.isocalendar()[1])
        return {"jaar": jaar, "week_nummer": {"$in": list(weeks_set)}}
    if jaar is not None and week_nummer is None and maand is None:
        return {"jaar": jaar}
    return {}


@api_router.get("/werkbonnen", response_model=List[Werkbon])
async def get_werkbonnen(
    user_id: str,
    is_admin: bool = Query(False),
    dashboard: bool = Query(False),
    week_nummer: Optional[int] = Query(None, description="ISO week filter (use with jaar)"),
    jaar: Optional[int] = Query(None, description="Calendar year (with week_nummer, maand, or alone)"),
    maand: Optional[int] = Query(None, ge=1, le=12, description="Month 1-12 (with jaar)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: Dict = Depends(get_current_user),
):
    company_id = _require_tenant(current_user)
    projection = {
        "_id": 0,
        "handtekening_data": 0,
        "handtekening": 0,
        "selfie_data": 0,
        "selfie": 0,
        "foto_data": 0,
        "fotos": 0,
        "photos": 0,
        "extra_materialen": 0,
        "uitgevoerde_werken": 0,
        "opmerkingen": 0,
        "gps": 0,
        "locatie": 0,
    }

    if is_admin:
        query = _werkbonnen_admin_filter_query(week_nummer, jaar, maand)
        query = _company_scope_query(company_id, query)
        eff_limit = 50 if dashboard else limit
        eff_skip = 0 if dashboard else skip
        cursor = db.werkbonnen.find(query, projection).sort("created_at", -1).skip(eff_skip).limit(eff_limit)
        try:
            werkbonnen = await asyncio.wait_for(cursor.to_list(eff_limit), timeout=10.0)
        except asyncio.TimeoutError:
            logging.warning("[werkbonnen] Admin query timed out, returning empty list")
            return []
        return [Werkbon(**wb) for wb in werkbonnen]

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    base_q: dict = {} if has_web_access(user.get("rol", "")) else {
        "$or": [{"ingevuld_door_id": user_id}, {"toegewezen_aan": user_id}]
    }
    # Combine base_q with company scope (handle existing $or carefully)
    if "$or" in base_q:
        query = {"$and": [base_q, _company_scope_query(company_id)]}
    else:
        query = _company_scope_query(company_id, base_q)
    cursor = db.werkbonnen.find(query, projection).sort("created_at", -1).limit(200)
    try:
        werkbonnen = await asyncio.wait_for(cursor.to_list(200), timeout=10.0)
    except asyncio.TimeoutError:
        logging.warning("[werkbonnen] User query timed out for user_id=%s", user_id)
        return []
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/user/{user_id}", response_model=List[Werkbon])
async def get_werkbonnen_by_user(user_id: str, current_user: Dict = Depends(get_current_user)):
    projection = {
        "_id": 0,
        "selfie_data": 0,
        "selfie": 0,
        "handtekening_data": 0,
        "handtekening": 0,
        "foto_data": 0
    }
    company_id = current_user.get("company_id")
    base_q = {"ingevuld_door_id": user_id}
    query = _company_scope_query(company_id, base_q)
    cursor = db.werkbonnen.find(query, projection).sort("created_at", -1).limit(100)
    werkbonnen = await cursor.to_list(100)
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/count")
async def count_werkbonnen(current_user: Dict = Depends(get_current_user)):
    """Lightweight endpoint — returns total werkbon count for change detection"""
    company_id = current_user.get("company_id")
    total = await db.werkbonnen.count_documents(_company_scope_query(company_id))
    return {"total": total}


@api_router.get("/werkbonnen/filter-count")
async def werkbonnen_filter_count(
    week_nummer: Optional[int] = Query(None),
    jaar: Optional[int] = Query(None),
    maand: Optional[int] = Query(None, ge=1, le=12),
    current_user: Dict = Depends(require_web_access()),
):
    """Count werkbonnen matching the same filters as GET /werkbonnen (admin)."""
    company_id = current_user.get("company_id")
    q = _company_scope_query(company_id, _werkbonnen_admin_filter_query(week_nummer, jaar, maand))
    count = await db.werkbonnen.count_documents(q)
    return {"count": count}

@api_router.get("/werkbonnen/export/zip")
async def export_werkbonnen_zip(
    start_date: str = Query(..., description="Start datum YYYY-MM-DD"),
    end_date: str = Query(..., description="Eind datum YYYY-MM-DD"),
    current_user: Dict = Depends(require_roles(["admin", "master_admin", "manager", "beheerder"])),
):
    """Generate ZIP archive of werkbon PDFs for a date range (max 100 werkbonnen)."""
    import zipfile
    from fastapi.responses import StreamingResponse

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ongeldig datumformaat. Gebruik YYYY-MM-DD")

    company_id = current_user.get("company_id")
    # Query by created_at ISO string (indexed field), scoped to tenant
    query = _company_scope_query(company_id, {
        "created_at": {
            "$gte": start_dt.isoformat(),
            "$lte": end_dt.isoformat(),
        }
    })
    werkbonnen_raw = await db.werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

    if not werkbonnen_raw:
        raise HTTPException(status_code=404, detail="Geen werkbonnen gevonden in de opgegeven periode")

    instellingen = await get_instellingen_for_company(company_id)

    zip_buffer = io.BytesIO()
    added = 0
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for wb in werkbonnen_raw:
            try:
                klant = await db.klanten.find_one(_company_scope_query(company_id, {"id": wb.get("klant_id", "")}), {"_id": 0}) or {}
                werf = await db.werven.find_one(_company_scope_query(company_id, {"id": wb.get("werf_id", "")}), {"_id": 0}) or {}
                fin = compute_werkbon_financials(wb, klant)
                total_uren = fin["total_uren"]
                totaal_bedrag = fin["totaal_bedrag"]
                pdf_bytes, pdf_filename = generate_werkbon_pdf(wb, klant, werf, instellingen, total_uren, totaal_bedrag)
                zf.writestr(pdf_filename, pdf_bytes)
                added += 1
            except Exception as exc:
                logging.warning("[ZIP] Skipping werkbon %s: %s", wb.get("id", "?"), exc)

    if added == 0:
        raise HTTPException(status_code=500, detail="PDF genereren mislukt voor alle werkbonnen")

    zip_buffer.seek(0)
    filename = f"werkbonnen_{start_date}_{end_date}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@api_router.get("/werkbonnen/{werkbon_id}", response_model=Werkbon)
async def get_werkbon(werkbon_id: str, response: Response, current_user: Dict = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    company_id = current_user.get("company_id")
    query = _company_scope_query(company_id, {"id": werkbon_id})
    werkbon = await db.werkbonnen.find_one(query)
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    return Werkbon(**werkbon)

@api_router.get("/week-dates/{year}/{week}")
async def get_week_dates_api(year: int, week: int):
    """Get dates for a specific week"""
    return get_week_dates(year, week)

# ============ UNIFIED WERKBON ENDPOINT (for new mobile app) ============
class UnifiedWerkbonCreate(BaseModel):
    """Flexible werkbon model that accepts frontend format"""
    type: str  # uren, oplevering, project, prestatie
    klant_id: Optional[str] = None
    klant_naam: Optional[str] = None
    werf_id: Optional[str] = None
    werf_naam: Optional[str] = None
    datum: Optional[str] = None
    opmerkingen: Optional[str] = ""
    
    # Signature
    handtekening: Optional[str] = None
    handtekening_naam: Optional[str] = None
    selfie: Optional[str] = None
    
    # GPS
    gps_locatie: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    gps_accuracy: Optional[float] = None
    
    # Uren specific
    week_nummer: Optional[int] = None
    jaar: Optional[int] = None
    uren: Optional[List[Dict]] = None
    uren_regels: Optional[List[Dict]] = None
    km_afstand: Optional[Any] = None
    uitgevoerde_werken: Optional[str] = ""
    extra_materialen: Optional[str] = ""
    
    # Oplevering specific
    omschrijving: Optional[str] = None
    opleverpunten: Optional[List[Dict]] = None
    
    # Project specific
    project_naam: Optional[str] = None
    taken: Optional[List[Dict]] = None
    materialen: Optional[List[Dict]] = None
    gebruikte_machines: Optional[str] = None
    aantal_personen: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = None
    vervolgwerk_nodig: Optional[bool] = False
    vervolgwerk_beschrijving: Optional[str] = None
    vervolgactie_datum: Optional[str] = None
    hindernissen: Optional[str] = None
    zone: Optional[str] = None
    contactpersoon: Optional[str] = None
    
    # Prestatie specific
    werk_naam: Optional[str] = None
    werk_omschrijving: Optional[str] = None
    hoeveelheid: Optional[float] = None
    eenheid: Optional[str] = None
    dikte_cm: Optional[float] = None
    aantal_lagen: Optional[int] = None
    
    # Common
    fotos: Optional[List[Dict]] = None
    verstuur_naar_klant: Optional[bool] = False
    werknemer_id: Optional[str] = None
    werknemer_naam: Optional[str] = None
    timestamp: Optional[str] = None
    planning_id: Optional[str] = None
    
    class Config:
        extra = "allow"  # Allow extra fields

@api_router.post("/werkbonnen/unified")
async def create_unified_werkbon(data: UnifiedWerkbonCreate, current_user: Dict = Depends(get_current_user)):
    """
    Unified werkbon creation endpoint for the new mobile app.
    Accepts a flexible format and routes to the appropriate collection based on type.
    """
    user_id = current_user["user_id"]
    user_naam = current_user["naam"]

    werkbon_type = data.type
    company_id_for_plan = _require_tenant(current_user)
    _sub_p, plan_p, _co_p = await _resolve_company_plan(company_id_for_plan)
    _require_werkbon_type(plan_p, werkbon_type)
    werkbon_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Base document
    base_doc = {
        "id": werkbon_id,
        "company_id": company_id_for_plan,
        "type": werkbon_type,
        "klant_id": data.klant_id,
        "klant_naam": data.klant_naam or "",
        "werf_id": data.werf_id,
        "werf_naam": data.werf_naam or "",
        "datum": data.datum or now.strftime("%Y-%m-%d"),
        "opmerkingen": data.opmerkingen or "",
        "handtekening": data.handtekening,
        "handtekening_data": data.handtekening,  # Also save as handtekening_data for PDF generation
        "handtekening_klant": data.handtekening,  # For oplevering/project verzend compatibility
        "handtekening_naam": data.handtekening_naam or "",
        "handtekening_klant_naam": data.handtekening_naam or "",  # For oplevering/project verzend compatibility
        "selfie": data.selfie,
        "selfie_data": data.selfie,  # Also save as selfie_data for PDF generation
        "gps_locatie": data.gps_locatie,
        "gps_lat": data.gps_lat,
        "gps_lng": data.gps_lng,
        "gps_accuracy": data.gps_accuracy,
        "ingevuld_door_id": user_id,
        "ingevuld_door_naam": user_naam,
        "status": "ondertekend" if data.handtekening else "concept",
        "created_at": now,
        "updated_at": now,
    }

    # Process km_afstand — store as per-day dict for all types
    if data.km_afstand and isinstance(data.km_afstand, dict):
        base_doc["km_afstand"] = data.km_afstand
    else:
        base_doc["km_afstand"] = {"maandag": 0, "dinsdag": 0, "woensdag": 0, "donderdag": 0, "vrijdag": 0, "zaterdag": 0, "zondag": 0}

    # Extract toegewezen_aan from uren regels (team member IDs for werkbon sharing)
    uren_list = data.uren or data.uren_regels or []
    toegewezen_ids = list({r.get("teamlid_id") for r in uren_list if r.get("teamlid_id")})

    # Save planning_id and merge planning werknemers into toegewezen_aan
    planning_id = data.planning_id
    base_doc["planning_id"] = planning_id
    if planning_id:
        planning_item = await db.planning.find_one({"id": planning_id, "company_id": base_doc["company_id"]})
        if planning_item:
            planning_werknemer_ids = planning_item.get("werknemer_ids", [])
            toegewezen_ids = list(set(toegewezen_ids + planning_werknemer_ids))

    base_doc["toegewezen_aan"] = toegewezen_ids

    # Process photos — max 3, skip photos over 5MB
    if data.fotos:
        accepted = []
        for f in data.fotos:
            if not f:
                continue
            foto_data = f.get("data") or f.get("uri") or ""
            # Strip data URI prefix to get raw base64 for size check
            raw_b64 = foto_data.split(",", 1)[-1] if "," in foto_data else foto_data
            approx_bytes = len(raw_b64) * 3 // 4
            if approx_bytes > 5 * 1024 * 1024:
                logging.warning(f"[werkbon save] Skipping photo: size ~{approx_bytes // 1024}KB exceeds 5MB limit")
                continue
            accepted.append(foto_data)
            if len(accepted) >= 3:
                break
        base_doc["fotos"] = accepted
    
    # Route by type
    if werkbon_type == "uren":
        # Process uren regels
        uren_regels = data.uren or data.uren_regels or []
        processed_uren = []
        for regel in uren_regels:
            processed_uren.append({
                "naam": regel.get("naam") or regel.get("teamlidNaam", ""),
                "maandag": regel.get("maandag", 0),
                "dinsdag": regel.get("dinsdag", 0),
                "woensdag": regel.get("woensdag", 0),
                "donderdag": regel.get("donderdag", 0),
                "vrijdag": regel.get("vrijdag", 0),
                "zaterdag": regel.get("zaterdag", 0),
                "zondag": regel.get("zondag", 0),
            })
        
        week_nummer = data.week_nummer or datetime.now().isocalendar()[1]
        jaar = data.jaar or datetime.now().year
        week_dates = get_week_dates(jaar, week_nummer)
        
        werkbon_doc = {
            **base_doc,
            "week_nummer": week_nummer,
            "jaar": jaar,
            "uren": processed_uren,
            # km_afstand already set in base_doc; keep it (don't override)

            "uitgevoerde_werken": data.uitgevoerde_werken or "",
            "extra_materialen": data.extra_materialen or "",
            **week_dates,
        }
        await db.werkbonnen.insert_one(werkbon_doc)
        
    elif werkbon_type == "oplevering":
        werkbon_doc = {
            **base_doc,
            "omschrijving": data.omschrijving or "",
            "opleverpunten": data.opleverpunten or [],
        }
        await db.oplevering_werkbonnen.insert_one(werkbon_doc)
        
    elif werkbon_type == "project":
        werkbon_doc = {
            **base_doc,
            "project_naam": data.project_naam or "",
            "uitgevoerde_werken": data.uitgevoerde_werken or "",
            "taken": data.taken or [],
            "materialen": data.materialen or [],
            "gebruikte_machines": data.gebruikte_machines or "",
            "aantal_personen": data.aantal_personen or 1,
            "start_time": data.start_time,
            "end_time": data.end_time,
            "status": data.status or "gestart",
            "vervolgwerk_nodig": data.vervolgwerk_nodig or False,
            "vervolgwerk_beschrijving": data.vervolgwerk_beschrijving,
            "vervolgactie_datum": data.vervolgactie_datum,
            "hindernissen": data.hindernissen,
            "zone": data.zone,
            "contactpersoon": data.contactpersoon,
        }
        await db.project_werkbonnen.insert_one(werkbon_doc)
        
    elif werkbon_type == "prestatie":
        werkbon_doc = {
            **base_doc,
            "werk_naam": data.werk_naam or "",
            "werk_omschrijving": data.werk_omschrijving or "",
            "hoeveelheid": data.hoeveelheid,
            "eenheid": data.eenheid or "m²",
            "dikte_cm": data.dikte_cm,
            "aantal_lagen": data.aantal_lagen,
            "zone": data.zone,
        }
        await db.productie_werkbonnen.insert_one(werkbon_doc)
        
    else:
        raise HTTPException(status_code=400, detail=f"Onbekend werkbon type: {werkbon_type}")
    
    return serialize_mongo_doc(werkbon_doc)



@api_router.post("/werkbonnen", response_model=Werkbon)
async def create_werkbon(werkbon_data: WerkbonCreate, current_user: Dict = Depends(get_current_user)):
    """Create werkbon - uses authenticated user's identity from JWT"""
    company_id = _require_tenant(current_user)
    _sub, plan, _co = await _resolve_company_plan(company_id)
    # POST /werkbonnen is the legacy "uren" path; ensure plan permits it
    _require_werkbon_type(plan, "uren")
    klant = await db.klanten.find_one({"id": werkbon_data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": werkbon_data.werf_id, "company_id": company_id})

    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    # Get week dates
    week_dates = get_week_dates(werkbon_data.jaar, werkbon_data.week_nummer)
    
    # Use authenticated user's identity from JWT (NOT from request parameters)
    user_id = current_user["user_id"]
    user_naam = current_user["naam"]
    
    werkbon_dict = werkbon_data.dict()
    werkbon_dict.update({
        "klant_naam": klant["naam"],
        "werf_naam": werf["naam"],
        "ingevuld_door_id": user_id,
        "ingevuld_door_naam": user_naam,
        **week_dates
    })
    
    if werkbon_dict.get("km_afstand") is None:
        werkbon_dict["km_afstand"] = KmRegel().dict()
    
    werkbon = Werkbon(**werkbon_dict)
    werkbon_doc = werkbon.dict()
    werkbon_doc["company_id"] = _require_tenant(current_user)
    await db.werkbonnen.insert_one(werkbon_doc)

    # Push notification to admins about new werkbon (tenant-scoped)
    try:
        admin_ids = []
        async for admin in db.users.find(
            {"company_id": company_id, "rol": {"$in": ["admin", "master_admin"]}, "actief": True},
            {"id": 1}
        ):
            if admin.get("id") != user_id:  # Don't notify the submitter
                admin_ids.append(admin["id"])
        if admin_ids:
            await send_push_notifications(
                admin_ids,
                "Nieuwe werkbon",
                f"{user_naam} heeft een werkbon ingediend ({klant['naam']} - {werf['naam']})",
                {"type": "werkbon", "werkbon_id": werkbon.id},
            )
    except Exception as e:
        logging.error(f"[PUSH] Werkbon admin notification failed: {e}")

    return werkbon

@api_router.put("/werkbonnen/{werkbon_id}", response_model=Werkbon)
async def update_werkbon(werkbon_id: str, update_data: WerkbonUpdate, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)

    # Resolve klant name if klant_id was provided (tenant-scoped)
    if update_data.klant_id and not update_data.klant_naam:
        klant = await db.klanten.find_one({"id": update_data.klant_id, "company_id": company_id})
        if klant:
            update_dict["klant_naam"] = klant["naam"]

    # Resolve werf name if werf_id was provided (tenant-scoped)
    if update_data.werf_id and not update_data.werf_naam:
        werf = await db.werven.find_one({"id": update_data.werf_id, "company_id": company_id})
        if werf:
            update_dict["werf_naam"] = werf["naam"]

    # Recalculate week dates if week/year changed (tenant-scoped lookup)
    existing = await db.werkbonnen.find_one({"id": werkbon_id, "company_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    new_week = update_data.week_nummer or existing.get("week_nummer")
    new_jaar = update_data.jaar or existing.get("jaar")
    if update_data.week_nummer or update_data.jaar:
        week_dates = get_week_dates(new_jaar, new_week)
        update_dict.update(week_dates)
    
    if update_data.handtekening_data:
        update_dict["handtekening_datum"] = datetime.now(timezone.utc)
        update_dict["status"] = "ondertekend"
    
    if "uren" in update_dict:
        update_dict["uren"] = [uur.dict() if hasattr(uur, 'dict') else uur for uur in update_dict["uren"]]
    
    if "km_afstand" in update_dict and hasattr(update_dict["km_afstand"], 'dict'):
        update_dict["km_afstand"] = update_dict["km_afstand"].dict()
    
    result = await db.werkbonnen.update_one({"id": werkbon_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

    updated = await db.werkbonnen.find_one({"id": werkbon_id, "company_id": company_id})
    return Werkbon(**updated)

@api_router.delete("/werkbonnen/{werkbon_id}")
async def delete_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    result = await db.werkbonnen.delete_one({"id": werkbon_id, "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    return {"message": "Werkbon verwijderd"}

@api_router.post("/werkbonnen/{werkbon_id}/dupliceer", response_model=Werkbon)
async def dupliceer_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    """Create a copy of an existing werkbon with current week number - uses authenticated user's identity from JWT"""
    company_id = _require_tenant(current_user)
    original = await db.werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

    # Use authenticated user's identity from JWT
    user_id = current_user["user_id"]
    user_naam = current_user["naam"]

    now = datetime.now(timezone.utc)
    iso = now.isocalendar()
    current_week = iso[1]
    current_year = iso[0]
    week_dates = get_week_dates(current_year, current_week)

    new_werkbon = Werkbon(
        week_nummer=current_week,
        jaar=current_year,
        klant_id=original["klant_id"],
        klant_naam=original["klant_naam"],
        werf_id=original["werf_id"],
        werf_naam=original["werf_naam"],
        uren=original.get("uren", []),
        km_afstand=original.get("km_afstand", KmRegel().dict()),
        uitgevoerde_werken="",
        extra_materialen="",
        ingevuld_door_id=user_id,
        ingevuld_door_naam=user_naam,
        status="concept",
        **week_dates,
    )
    new_doc = new_werkbon.dict()
    new_doc["company_id"] = company_id
    await db.werkbonnen.insert_one(new_doc)
    return new_werkbon

# ==================== ONE-SHOT TENANT WIPE (manual, master_admin only) ====================

@api_router.post("/_admin/wipe-tenant-by-email")
async def wipe_tenant_by_email(
    email: str = Query(..., description="Email of the master_admin whose tenant should be deleted"),
    confirm: str = Query(..., description="Must be the literal string DELETE"),
    current_user: Dict = Depends(require_roles(["platform_admin"])),
):
    """Manual cleanup endpoint. Deletes the user, their company, and every
    document scoped to that company_id. platform_admin only."""
    if confirm != "DELETE":
        raise HTTPException(status_code=400, detail="confirm must equal DELETE")
    target_email = email.lower().strip()
    if current_user["email"].lower() == target_email:
        raise HTTPException(status_code=400, detail="Cannot wipe your own account")

    target_user = await db.users.find_one({"email": target_email}, {"_id": 0, "id": 1, "company_id": 1})
    target_company = await db.companies.find_one(
        {"$or": [{"email": target_email}, {"contact_email": target_email}]},
        {"_id": 0, "id": 1},
    )
    cids = set()
    if target_user and target_user.get("company_id") and target_user["company_id"] != "default_company":
        cids.add(target_user["company_id"])
    if target_company and target_company.get("id") and target_company["id"] != "default_company":
        cids.add(target_company["id"])

    deleted = {}
    for cid in cids:
        for coll_name in ("instellingen", "klanten", "werven", "werkbonnen", "planning", "berichten", "teams", "users"):
            r = await db[coll_name].delete_many({"company_id": cid})
            deleted[f"{coll_name}:{cid}"] = r.deleted_count
        r = await db.companies.delete_many({"id": cid})
        deleted[f"companies:{cid}"] = r.deleted_count

    r_user = await db.users.delete_many({"email": target_email})
    r_comp = await db.companies.delete_many(
        {"$or": [{"email": target_email}, {"contact_email": target_email}]}
    )
    deleted["users_by_email"] = r_user.deleted_count
    deleted["companies_by_email"] = r_comp.deleted_count
    return {"company_ids": list(cids), "deleted": deleted}

# ==================== ORPHAN USER REPAIR (platform_admin only) ====================
# Werknemers added before the company_id-on-create fix landed in
# company_id="default_company". These endpoints let the platform owner
# inspect and reassign those orphans to the correct tenant.

class ReassignUsersBody(BaseModel):
    emails: List[str]
    target_company_id: str


@api_router.get("/_admin/orphaned-users")
async def list_orphaned_users(current_user: Dict = Depends(require_roles(["platform_admin"]))):
    """List users stuck in default_company (excluding the legacy Smart-Tech tenant admin)."""
    cursor = db.users.find(
        {"company_id": "default_company", "email": {"$ne": "info@smart-techbv.be"}},
        {"_id": 0, "id": 1, "email": 1, "naam": 1, "rol": 1, "created_at": 1, "actief": 1},
    ).sort("created_at", -1)
    users = await cursor.to_list(1000)
    return {"count": len(users), "users": users}


@api_router.post("/_admin/reassign-users")
async def reassign_users(body: ReassignUsersBody, current_user: Dict = Depends(require_roles(["platform_admin"]))):
    """Move users (matched by email) into the target tenant. platform_admin only."""
    target = (body.target_company_id or "").strip()
    if not target or target == "default_company":
        raise HTTPException(status_code=400, detail="target_company_id is required and cannot be default_company")

    company = await db.companies.find_one({"id": target}, {"_id": 0, "id": 1})
    if not company:
        raise HTTPException(status_code=404, detail=f"Target company {target} bestaat niet")

    normalized = [e.lower().strip() for e in (body.emails or []) if e and e.strip()]
    if not normalized:
        raise HTTPException(status_code=400, detail="emails is required")

    result = await db.users.update_many(
        {"email": {"$in": normalized}},
        {"$set": {"company_id": target}},
    )
    clear_cache("auth:users")
    return {
        "matched": result.matched_count,
        "modified": result.modified_count,
        "target_company_id": target,
        "emails": normalized,
    }


# ==================== ONBOARDING STATUS ====================

@api_router.get("/onboarding/status")
async def onboarding_status(current_user: Dict = Depends(get_current_user)):
    """Counts used by the dashboard onboarding wizard. Returns zeros for fresh tenants."""
    company_id = _require_tenant(current_user)
    scope = _company_scope_query(company_id)
    klanten = await db.klanten.count_documents(scope)
    werknemers = await db.users.count_documents(scope)
    werven = await db.werven.count_documents(scope)
    werkbonnen = await db.werkbonnen.count_documents(scope)
    instellingen_doc = await db.instellingen.find_one(
        {"id": "company_settings", "company_id": company_id}, {"_id": 0, "logo_base64": 1, "telefoon": 1}
    ) or {}
    has_company_details = bool(instellingen_doc.get("logo_base64") or instellingen_doc.get("telefoon"))
    return {
        "company_id": company_id,
        "klanten": klanten,
        "werknemers": werknemers,
        "werven": werven,
        "werkbonnen": werkbonnen,
        "has_company_details": has_company_details,
        "show_wizard": (klanten == 0 and werven == 0 and werkbonnen == 0),
    }

# ==================== BEDRIJFSINSTELLINGEN ROUTES ====================

@api_router.get("/instellingen")
async def get_instellingen(current_user: Dict = Depends(require_web_access())):
    """Get company settings. Web panel users can read."""
    company_id = _require_tenant(current_user)
    cache_key = f"instellingen:company:{company_id}"
    cached = get_cache(cache_key, ttl_seconds=120)
    if cached is not None:
        return cached
    settings = await get_instellingen_for_company(company_id)
    if not settings:
        default = BedrijfsInstellingen()
        default_dict = default.dict()
        default_dict["company_id"] = company_id
        # Wipe identifying defaults so a fresh tenant sees an empty profile,
        # not the platform-default Signybon name/colors of another tenant.
        default_dict["bedrijfsnaam"] = ""
        default_dict["email"] = ""
        default_dict["telefoon"] = None
        default_dict["btw_nummer"] = None
        default_dict["logo_base64"] = None
        await db.instellingen.insert_one(default_dict.copy())
        set_cache(cache_key, default_dict)
        return default_dict

    # Add frontend-compatible field name aliases (without removing Dutch originals)
    if settings.get('adres_gestructureerd') and not settings.get('adres_structured'):
        settings['adres_structured'] = settings['adres_gestructureerd']
    if settings.get('pdf_teksten') and not settings.get('pdf_texts'):
        settings['pdf_texts'] = settings['pdf_teksten']
    if not settings.get('werkbon_email'):
        emails = settings.get('emails') or {}
        if emails.get('werkbon'):
            settings['werkbon_email'] = emails['werkbon']

    set_cache(cache_key, settings)
    return settings

@api_router.put("/instellingen")
async def update_instellingen(update_data: BedrijfsInstellingenUpdate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update company settings. Only admin/master_admin can modify."""
    company_id = _require_tenant(current_user)
    # "DELETE" sentinel signals explicit removal (empty string in DB)
    update_dict = {}
    for k, v in update_data.dict().items():
        if v is None:
            continue
        if v == "DELETE":
            update_dict[k] = ""
        else:
            update_dict[k] = v

    logger.info("[instellingen PUT] Update keys: %s | has logo_base64: %s | branding keys: %s",
                list(update_dict.keys()),
                'logo_base64' in update_dict,
                list(update_dict.get('branding', {}).keys()) if isinstance(update_dict.get('branding'), dict) else 'n/a')

    # Normalize field names: frontend sends adres_structured / pdf_texts
    if 'adres_structured' in update_dict:
        update_dict['adres_gestructureerd'] = update_dict.pop('adres_structured')
    if 'pdf_texts' in update_dict:
        update_dict['pdf_teksten'] = update_dict.pop('pdf_texts')

    # Logo deletion: empty string means user wants to actually remove the logo
    logo_being_deleted = 'logo_base64' in update_dict and update_dict['logo_base64'] == ""

    # Sync logo: if branding.logo_base64 is sent, also persist at top level and vice versa
    # BUT do not override an explicit deletion with the old branding logo
    branding_dict = update_dict.get('branding') or {}
    if isinstance(branding_dict, dict):
        if branding_dict.get('logo_base64') and not update_dict.get('logo_base64') and not logo_being_deleted:
            update_dict['logo_base64'] = branding_dict['logo_base64']
        elif update_dict.get('logo_base64') and not branding_dict.get('logo_base64'):
            branding_dict['logo_base64'] = update_dict['logo_base64']
            update_dict['branding'] = branding_dict

    # When deleting logo, also clear branding.logo_base64 inside the branding dict
    # (cannot mix nested dict $set with dot-notation in same update)
    if logo_being_deleted:
        if not isinstance(update_dict.get('branding'), dict):
            update_dict['branding'] = {}
        update_dict['branding']['logo_base64'] = ""

    update_dict["company_id"] = company_id
    await db.instellingen.update_one(
        {"id": "company_settings", "company_id": company_id},
        {"$set": update_dict},
        upsert=True
    )
    clear_cache("instellingen")
    clear_cache("app-settings:")
    clear_cache("app-settings:logo:")

    updated = await get_instellingen_for_company(company_id)
    if updated.get('adres_gestructureerd') and not updated.get('adres_structured'):
        updated['adres_structured'] = updated['adres_gestructureerd']
    if updated.get('pdf_teksten') and not updated.get('pdf_texts'):
        updated['pdf_texts'] = updated['pdf_teksten']
    return updated

# ==================== FACTURATIE KOPPELING ROUTES ====================

@api_router.get("/instellingen/facturatie")
async def get_facturatie_instellingen(current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Facturatie koppeling instellingen ophalen."""
    company_id = _require_tenant(current_user)
    settings = await get_instellingen_for_company(company_id)
    if not settings:
        return {
            "billit_api_key": None,
            "billit_party_id": None,
            "billit_omschrijving_template": "Werkzaamheden week {week} - {werf}",
            "billit_referentie_veld": "Reference",
            "billit_actief": False,
            "billit_auto_versturen": False,
        }
    return {
        "billit_api_key": settings.get("billit_api_key"),
        "billit_party_id": settings.get("billit_party_id"),
        "billit_omschrijving_template": settings.get("billit_omschrijving_template", "Werkzaamheden week {week} - {werf}"),
        "billit_referentie_veld": settings.get("billit_referentie_veld", "Reference"),
        "billit_actief": settings.get("billit_actief", False),
        "billit_auto_versturen": settings.get("billit_auto_versturen", False),
    }

@api_router.put("/instellingen/facturatie")
async def update_facturatie_instellingen(update_data: Dict, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Facturatie koppeling instellingen opslaan."""
    company_id = _require_tenant(current_user)
    allowed_keys = {"billit_api_key", "billit_party_id", "billit_omschrijving_template", "billit_referentie_veld", "billit_actief", "billit_auto_versturen"}
    update_dict = {k: v for k, v in update_data.items() if k in allowed_keys}
    update_dict["company_id"] = company_id
    await db.instellingen.update_one(
        {"id": "company_settings", "company_id": company_id},
        {"$set": update_dict},
        upsert=True
    )
    clear_cache("instellingen")
    updated = await get_instellingen_for_company(company_id)
    return {
        "billit_api_key": updated.get("billit_api_key"),
        "billit_party_id": updated.get("billit_party_id"),
        "billit_omschrijving_template": updated.get("billit_omschrijving_template", "Werkzaamheden week {week} - {werf}"),
        "billit_referentie_veld": updated.get("billit_referentie_veld", "Reference"),
        "billit_actief": updated.get("billit_actief", False),
        "billit_auto_versturen": updated.get("billit_auto_versturen", False),
    }

# ==================== BILLIT INTEGRATION ====================

async def send_werkbon_to_billit(werkbon: dict, klant: dict, instellingen: dict) -> dict:
    """Werkbon verisi Billit API'sine gönderir. Hata olursa loglar ve False döner."""
    billit_api_key = instellingen.get("billit_api_key")
    if not billit_api_key:
        logging.warning("[Billit] API key niet geconfigureerd, stuur overgeslagen.")
        return {"success": False, "error": "Billit API key niet geconfigureerd"}

    omschrijving_template = instellingen.get("billit_omschrijving_template", "Werkzaamheden week {week} - {werf}")
    referentie_veld = instellingen.get("billit_referentie_veld", "Reference")

    # Omschrijving invullen
    week_nr = werkbon.get("week_nummer", "")
    jaar = werkbon.get("jaar", "")
    werf_naam = werkbon.get("werf_naam") or "Onbekend"
    klant_naam = werkbon.get("klant_naam") or klant.get("bedrijfsnaam") or klant.get("naam") or "Onbekend"
    omschrijving = (
        omschrijving_template
        .replace("{week}", str(week_nr))
        .replace("{werf}", werf_naam)
        .replace("{klant}", klant_naam)
        .replace("{jaar}", str(jaar))
    )

    # Werkbon referentienummer
    werkbon_ref = f"WB-{jaar}-W{week_nr}-{werkbon['id'][:6].upper()}"

    # Datum berekenen
    datum_ma = werkbon.get("datum_maandag")
    jaar_val = werkbon.get("jaar", datetime.now(timezone.utc).year)

    if datum_ma and jaar_val:
        parts = str(datum_ma).split("-")
        if len(parts) == 2:
            # "DD-MM" formaat → "YYYY-MM-DD"
            order_date = f"{jaar_val}-{parts[1]}-{parts[0]}"
        else:
            order_date = str(datum_ma)[:10]
    else:
        order_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        expiry_dt = datetime.strptime(order_date, "%Y-%m-%d") + timedelta(days=30)
        expiry_date = expiry_dt.strftime("%Y-%m-%d")
    except Exception:
        expiry_date = order_date

    # Financials
    fin = compute_werkbon_financials(werkbon, klant)
    totaal_bedrag = fin.get("totaal_bedrag", 0.0)
    btw_percentage = float(klant.get("btw_percentage", 21))

    billit_party_id = instellingen.get("billit_party_id")
    headers = {
        "ApiKey": billit_api_key,
        "PartyID": str(billit_party_id) if billit_party_id is not None else "",
        "Content-Type": "application/json",
    }

    # PDF oluştur
    import base64
    pdf_attachment = None
    try:
        werf = await db.werven.find_one({"id": werkbon.get("werf_id")}, {"_id": 0}) or {}
        werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)
        fin_pdf = compute_werkbon_financials(werkbon_prepared, klant)
        pdf_bytes, pdf_filename = generate_werkbon_pdf(
            werkbon_prepared, klant, werf, instellingen,
            fin_pdf["total_uren"], fin_pdf["totaal_bedrag"]
        )
        if pdf_bytes:
            pdf_attachment = {
                "FileName": pdf_filename,
                "MimeType": "application/pdf",
                "FileContent": base64.b64encode(pdf_bytes).decode()
            }
    except Exception as pdf_exc:
        print(f"[Billit] PDF oluşturma hatası: {pdf_exc}")

    # Billit JSON payload — sabit CustomerID
    payload: dict = {
        "OrderType": "Invoice",
        "OrderDirection": "Income",
        "OrderDate": order_date,
        "DeliveryDate": order_date,
        "ExpiryDate": expiry_date,
        "CustomerID": 48335129,
        "OrderLines": [
            {
                "Quantity": 1,
                "UnitPriceExcl": totaal_bedrag,
                "Description": omschrijving,
                "VATPercentage": btw_percentage
            }
        ],
    }
    if pdf_attachment:
        payload["Attachments"] = [pdf_attachment]
    if btw_percentage == 0:
        payload["VentilationCode"] = "21"
    payload[referentie_veld] = werkbon_ref

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post("https://api.billit.be/v1/orders", json=payload, headers=headers)
        if resp.status_code in (200, 201):
            order_id = resp.json() if isinstance(resp.json(), int) else resp.json().get("OrderID") or resp.json().get("Id")
            logging.info("[Billit] Werkbon %s succesvol verstuurd. OrderID: %s | PDF bijlage: %s", werkbon["id"], order_id, "ja" if pdf_attachment else "nee")
            return {"success": True, "billit_order_id": order_id}
        else:
            logging.error("[Billit] Fout bij versturen werkbon %s. Status: %s | Body: %s", werkbon["id"], resp.status_code, resp.text[:500])
            return {"success": False, "error": f"Billit API status {resp.status_code}: {resp.text[:200]}"}
    except Exception as exc:
        logging.error("[Billit] Uitzondering bij versturen werkbon %s: %s", werkbon["id"], str(exc))
        return {"success": False, "error": str(exc)}

@api_router.post("/werkbonnen/{werkbon_id}/verstuur-billit")
async def verstuur_werkbon_naar_billit(werkbon_id: str, current_user: Dict = Depends(require_web_access())):
    """Werkbon handmatig naar Billit sturen."""
    company_id = _require_tenant(current_user)
    _sub_bl, plan_bl, _co_bl = await _resolve_company_plan(company_id)
    _require_feature(plan_bl, "billit", "Billit-koppeling")
    werkbon = await db.werkbonnen.find_one(_company_scope_query(company_id, {"id": werkbon_id}), {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

    klant = await db.klanten.find_one(_company_scope_query(company_id, {"id": werkbon.get("klant_id")}), {"_id": 0}) or {}
    instellingen = await get_instellingen_for_company(company_id)

    result = await send_werkbon_to_billit(werkbon, klant, instellingen)

    if result.get("success"):
        await db.werkbonnen.update_one(
            {"id": werkbon_id},
            {"$set": {
                "billit_verzonden": True,
                "billit_verzonden_at": datetime.now(timezone.utc).isoformat(),
                "billit_error": None,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    else:
        await db.werkbonnen.update_one(
            {"id": werkbon_id},
            {"$set": {
                "billit_verzonden": False,
                "billit_error": result.get("error"),
                "updated_at": datetime.now(timezone.utc)
            }}
        )

    return result

# ==================== EMAIL SERVICE ====================

async def send_werkbon_email(
    werkbon: dict,
    klant: dict,
    instellingen: dict,
    total_uren: float,
    totaal_bedrag: float,
    pdf_bytes: bytes,
    pdf_filename: str,
    klant_email: Optional[str] = None,  # Optional manual client email
    user_email: Optional[str] = None,   # Logged-in user's address (final fallback)
):
    """Send werkbon PDF email. Recipient priority: instellingen.werkbon_email →
    instellingen.email → logged-in user_email. Never falls back to a hardcoded
    address. Klant address is only included when explicitly provided here."""

    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping email")
        return {"success": False, "error": "Email not configured"}

    week = werkbon.get("week_nummer", "?")
    year = werkbon.get("jaar", "?")
    werf_naam = werkbon.get("werf_naam", "Onbekend")
    klant_naam = werkbon.get("klant_naam", "Onbekend")
    ondertekend_door = werkbon.get("handtekening_naam", "Onbekend")
    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen, user_email=user_email)

    # Default: only company email. Add client email only when explicitly provided.
    if klant_email and klant_email.strip():
        recipients = get_unique_recipients(company_recipient, klant_email.strip())
    else:
        recipients = [company_recipient] if company_recipient else []

    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}
    
    klant_btw = klant.get("btw_nummer", "")
    klant_btw_row = f"<tr><td>BTW Nr. Klant</td><td>{klant_btw}</td></tr>" if klant_btw else ""
    fin = compute_werkbon_financials(werkbon, klant)
    totaal_uren_mail = fin["total_uren"]
    uurtarief_mail = fin["uurtarief"]
    totaal_bedrag_mail = fin["totaal_bedrag"]
    km_tot_mail = fin["km_tot"]
    km_tarief_mail = fin["km_tarief"]
    km_bedrag_mail = fin["km_bedrag"]
    km_rows_html = ""
    if km_tot_mail > 0:
        if km_tarief_mail > 0:
            km_rows_html = f"""
                <tr>
                    <td>Totaal KM</td>
                    <td><strong>{km_tot_mail} km</strong></td>
                </tr>
                <tr>
                    <td>KM vergoeding</td>
                    <td>{km_tot_mail} km × €{km_tarief_mail:.2f} = €{km_bedrag_mail:.2f}</td>
                </tr>
            """
        else:
            km_rows_html = f"""
                <tr>
                    <td>Totaal KM</td>
                    <td><strong>{km_tot_mail} km</strong></td>
                </tr>
            """
    
    # Build HTML email
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; }}
            .header {{ background: #1a1a2e; color: white; padding: 28px; text-align: center; border-bottom: 4px solid #F5A623; }}
            .header h1 {{ color: #F5A623; margin: 0 0 6px 0; font-size: 22px; }}
            .header p {{ color: #aaa; margin: 0; font-size: 14px; }}
            .content {{ padding: 28px; }}
            .info-box {{ background: #f8f9fa; border-left: 4px solid #F5A623; padding: 16px; margin: 20px 0; border-radius: 4px; }}
            .info-box strong {{ color: #1a1a2e; }}
            .highlight {{ color: #F5A623; font-weight: bold; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 10px 14px; text-align: left; font-size: 14px; }}
            th {{ background: #1a1a2e; color: #F5A623; font-weight: 600; }}
            .total-row {{ background: #fff3cd; font-weight: bold; }}
            .disclaimer {{ background: #eef6ff; border-left: 4px solid #1a73e8; padding: 14px 18px; margin: 24px 0; border-radius: 4px; font-size: 13px; color: #333; }}
            .footer {{ background: #f0f0f0; padding: 16px 20px; font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #ddd; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>{bedrijfsnaam}</h1>
            <p>Werkbon — Week {week} / {year}</p>
        </div>
        
        <div class="content">
            <p>Beste {klant_naam},</p>
            
            <p>Hierbij vindt u de ondertekende werkbon van <span class="highlight">week {week}</span> voor werf <span class="highlight">{werf_naam}</span>. De werkbon is als PDF bijgevoegd.</p>
            
            <div class="info-box">
                <strong>Klant:</strong> {klant_naam}<br/>
                <strong>Werf:</strong> {werf_naam}<br/>
                <strong>Periode:</strong> Week {week}, {year}<br/>
                <strong>Ondertekend door:</strong> {ondertekend_door}<br/>
                {f"<strong>Prijsafspraak:</strong> {klant.get('prijsafspraak')}<br/>" if klant.get('prijsafspraak') else ''}
                {f"<strong>BTW Nr.:</strong> {klant_btw}<br/>" if klant_btw else ''}
            </div>
            
            <table>
                <tr>
                    <th>Omschrijving</th>
                    <th>Waarde</th>
                </tr>
                <tr>
                    <td>Totaal gewerkte uren</td>
                    <td><strong>{totaal_uren_mail} uur</strong></td>
                </tr>
                <tr>
                    <td>Uurtarief</td>
                    <td>€{uurtarief_mail:.2f}</td>
                </tr>
                {km_rows_html}
                {klant_btw_row}
                <tr class="total-row">
                    <td>Totaal bedrag</td>
                    <td>€{totaal_bedrag_mail:.2f}</td>
                </tr>
            </table>

            <div class="disclaimer">
                <strong>Belangrijk:</strong> Gelieve uw opmerkingen binnen 5 werkdagen door te sturen naar <a href="mailto:{company_recipient}">{company_recipient}</a>.<br/>
                Zonder tegenbericht wordt deze werkbon als goedgekeurd beschouwd.
            </div>
            
            <p>Met vriendelijke groeten,<br/><strong>{bedrijfsnaam}</strong></p>
        </div>
        
        <div class="footer">
            <p>{instellingen.get('pdf_voettekst', 'Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week.')}</p>
            <p style="margin-top:8px;">Dit is een automatisch gegenereerd bericht van {bedrijfsnaam}.</p>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": get_sender_email(instellingen),
            **({"reply_to": [get_reply_to(instellingen, user_email=user_email)]} if get_reply_to(instellingen, user_email=user_email) else {}),
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
            "to": recipients,
            "subject": f"Werkbon PDF - Week {week} - {werf_naam}",
            "html": html_content,
            "attachments": [
                {
                    "filename": pdf_filename,
                    "content": base64.b64encode(pdf_bytes).decode(),
                    "contentType": "application/pdf",
                }
            ],
        }
        
        # Run sync SDK in thread to keep FastAPI non-blocking
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent successfully: {result}")
        return {"success": True, "email_id": result.get("id"), "recipients": recipients}
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return {"success": False, "error": str(e), "recipients": recipients}


async def send_oplevering_email(
    werkbon: dict,
    instellingen: dict,
    pdf_bytes: bytes,
    pdf_filename: str,
    klant_email: Optional[str] = None,
    user_email: Optional[str] = None,
):
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping oplevering email")
        return {"success": False, "error": "Email not configured", "recipients": []}

    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen, user_email=user_email)
    klant_recipient = (klant_email or werkbon.get("klant_email_override") or werkbon.get("klant_email") or "").strip() or None

    recipients = [company_recipient] if company_recipient else []
    if werkbon.get("verstuur_naar_klant") and klant_recipient:
        recipients = get_unique_recipients(company_recipient, klant_recipient)

    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}

    subject = f"Oplevering PDF - {werkbon.get('werf_naam', 'Werf')} - {werkbon.get('datum', '')}"
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset=\"utf-8\" />
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto; }}
            .header {{ background: #1a1a2e; color: white; padding: 24px; text-align: center; border-bottom: 4px solid #F5A623; }}
            .header h1 {{ color: #F5A623; margin: 0; }}
            .content {{ padding: 24px; }}
            .info {{ background: #f8f9fa; border-left: 4px solid #F5A623; padding: 16px; margin: 18px 0; }}
            .footer {{ background: #f4f4f4; padding: 16px; font-size: 12px; color: #666; text-align: center; }}
        </style>
    </head>
    <body>
        <div class=\"header\">
            <h1>{bedrijfsnaam}</h1>
            <p>Ondertekende oplevering werkbon</p>
        </div>
        <div class=\"content\">
            <p>In bijlage vindt u de oplevering werkbon als PDF.</p>
            <div class=\"info\">
                <strong>Klant:</strong> {werkbon.get('klant_naam') or '-'}<br/>
                <strong>Werf:</strong> {werkbon.get('werf_naam') or '-'}<br/>
                <strong>Datum:</strong> {werkbon.get('datum') or '-'}<br/>
                <strong>Ondertekend door:</strong> {werkbon.get('handtekening_klant_naam') or '-'}
            </div>
            <p>Schade status: <strong>{'Schade aanwezig' if werkbon.get('schade_status') == 'schade_aanwezig' else 'Geen schade'}</strong></p>
            <p>Met vriendelijke groeten,<br/><strong>{bedrijfsnaam}</strong></p>
        </div>
        <div class=\"footer\">Dit is een automatisch gegenereerde e-mail van {bedrijfsnaam}.</div>
    </body>
    </html>
    """

    try:
        params = {
            "from": get_sender_email(instellingen),
            **({"reply_to": [get_reply_to(instellingen, user_email=user_email)]} if get_reply_to(instellingen, user_email=user_email) else {}),
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
            "to": recipients,
            "subject": subject,
            "html": html_content,
            "attachments": [
                {
                    "filename": pdf_filename,
                    "content": base64.b64encode(pdf_bytes).decode(),
                    "contentType": "application/pdf",
                }
            ],
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info("Oplevering email sent successfully: %s", result)
        return {"success": True, "email_id": result.get("id"), "recipients": recipients}
    except Exception as e:
        logging.error("Failed to send oplevering email: %s", str(e))
        return {"success": False, "error": str(e), "recipients": recipients}

@api_router.post("/werkbonnen/{werkbon_id}/verzenden")
async def verzend_werkbon(
    werkbon_id: str,
    klant_email: Optional[str] = Query(None),
    force: bool = Query(False),
    current_user: Dict = Depends(get_current_user),
):
    """Generate signed werkbon PDF and email it. By default only to company. Provide klant_email to also send to client. Use force=true to bypass status check."""
    company_id = _require_tenant(current_user)
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

    if werkbon.get("status") != "ondertekend" and not force:
        raise HTTPException(status_code=400, detail="Werkbon moet eerst ondertekend worden")
    
    # Get klant for hourly rate (tenant-scoped)
    klant = await db.klanten.find_one({"id": werkbon["klant_id"], "company_id": company_id}, {"_id": 0})
    werf = await db.werven.find_one({"id": werkbon["werf_id"], "company_id": company_id}, {"_id": 0}) or {}

    # Get company settings (tenant-scoped — fall back to {} so caller can still try user_email)
    instellingen = await get_instellingen_for_company(company_id)

    try:
        import gc
        # Force garbage collection before PDF generation to free memory
        gc.collect()

        werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)
        fin_pdf = compute_werkbon_financials(werkbon_prepared, klant or {})
        total_uren = fin_pdf["total_uren"]
        uurtarief = fin_pdf["uurtarief"]
        totaal_bedrag = fin_pdf["totaal_bedrag"]
        pdf_bytes, pdf_filename = generate_werkbon_pdf(werkbon_prepared, klant or {}, werf, instellingen, total_uren, totaal_bedrag)

        # Force garbage collection after PDF generation
        gc.collect()
    except Exception as exc:
        logging.exception("PDF generation failed for werkbon %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")

    # Send email - klant_email is optional (only if user explicitly provided it)
    try:
        email_result = await send_werkbon_email(
            werkbon,
            klant or {},
            instellingen,
            total_uren,
            totaal_bedrag,
            pdf_bytes,
            pdf_filename,
            klant_email=klant_email,
            user_email=current_user.get("email"),
        )
    except Exception as mail_err:
        logger.error(f"Mail verzenden mislukt: {mail_err}")
        email_result = {"success": False, "error": str(mail_err)}
    nieuwe_status = "verzonden" if email_result.get("success") else werkbon.get("status", "ondertekend")
    
    # Update werkbon status
    await db.werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": {
            "status": nieuwe_status,
            "email_verzonden": email_result.get("success", False),
            "email_error": email_result.get("error"),
            "pdf_bestandsnaam": pdf_filename,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Auto-send to Billit if enabled
    billit_result = None
    if instellingen.get("billit_actief") and instellingen.get("billit_auto_versturen"):
        try:
            werkbon_for_billit = await db.werkbonnen.find_one({"id": werkbon_id}, {"_id": 0}) or werkbon
            billit_result = await send_werkbon_to_billit(werkbon_for_billit, klant or {}, instellingen)
            billit_update: dict = {"updated_at": datetime.now(timezone.utc)}
            if billit_result.get("success"):
                billit_update["billit_verzonden"] = True
                billit_update["billit_verzonden_at"] = datetime.now(timezone.utc).isoformat()
                billit_update["billit_error"] = None
            else:
                billit_update["billit_verzonden"] = False
                billit_update["billit_error"] = billit_result.get("error")
            await db.werkbonnen.update_one({"id": werkbon_id}, {"$set": billit_update})
        except Exception as billit_exc:
            logging.error("[Billit auto] Fout bij automatisch versturen werkbon %s: %s", werkbon_id, str(billit_exc))
            billit_result = {"success": False, "error": str(billit_exc)}

    return {
        "message": "Werkbon als PDF verzonden" if email_result.get("success") else "PDF gemaakt, maar e-mail kon niet worden verzonden",
        "status": nieuwe_status,
        "totaal_uren": total_uren,
        "uurtarief": uurtarief,
        "totaal_bedrag": totaal_bedrag,
        "pdf_filename": pdf_filename,
        "recipients": email_result.get("recipients", []),
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "billit_sent": billit_result.get("success") if billit_result else None,
        "billit_error": billit_result.get("error") if billit_result and not billit_result.get("success") else None,
        "success": True
    }


# ─────────────────────────────────────────────────────────────────────────────
# WERKBON GROEP (multi-week bundle) — signature, PDF, email, verzenden
# ─────────────────────────────────────────────────────────────────────────────

@api_router.get("/werkbon-groepen")
async def list_werkbon_groepen(current_user: Dict = Depends(get_current_user)):
    """List werkbon groepen for the current tenant, newest first."""
    company_id = _require_tenant(current_user)
    items = await db.werkbon_groepen.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api_router.get("/werkbon-groepen/{groep_id}")
async def get_werkbon_groep(groep_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    groep = await db.werkbon_groepen.find_one({"id": groep_id, "company_id": company_id}, {"_id": 0})
    if not groep:
        raise HTTPException(status_code=404, detail="Werkbon groep niet gevonden")
    # Resolve children — handy for the signature screen and the verzenden UI
    werkbonnen = await db.werkbonnen.find(
        {"groep_id": groep_id, "company_id": company_id}, {"_id": 0}
    ).sort([("jaar", 1), ("week_nummer", 1)]).to_list(200)
    groep["werkbonnen"] = werkbonnen
    return groep


@api_router.put("/werkbon-groepen/{groep_id}")
async def update_werkbon_groep(
    groep_id: str,
    update_data: WerkbonGroepUpdate,
    current_user: Dict = Depends(get_current_user),
):
    """Update a werkbon groep — primarily used to persist the single klant
    signature that covers every week in the bundle."""
    company_id = _require_tenant(current_user)
    existing = await db.werkbon_groepen.find_one({"id": groep_id, "company_id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Werkbon groep niet gevonden")

    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    if update_data.handtekening_data:
        update_dict["handtekening_datum"] = datetime.now(timezone.utc)
        update_dict["status"] = "ondertekend"

    await db.werkbon_groepen.update_one(
        {"id": groep_id, "company_id": company_id},
        {"$set": update_dict},
    )
    return await db.werkbon_groepen.find_one({"id": groep_id, "company_id": company_id}, {"_id": 0})


async def send_werkbon_groep_email(
    groep: dict,
    werkbonnen: List[dict],
    klant: dict,
    instellingen: dict,
    pdf_bytes: bytes,
    pdf_filename: str,
    *,
    totals: Dict[str, float],
    klant_email: Optional[str] = None,
    user_email: Optional[str] = None,
) -> Dict[str, Any]:
    """Email the combined multi-week werkbon PDF. Subject and body reflect the
    periode (not a single week). Recipient selection follows the same strict
    no-hardcoded-fallback rules as send_werkbon_email."""
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping email")
        return {"success": False, "error": "Email not configured"}

    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen, user_email=user_email)
    klant_recipient = (klant_email or "").strip() or None

    if klant_recipient:
        recipients = get_unique_recipients(company_recipient, klant_recipient)
    else:
        recipients = [company_recipient] if company_recipient else []
    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}

    periode_van = groep.get("periode_van", "?")
    periode_tot = groep.get("periode_tot", "?")
    klant_naam = groep.get("klant_naam") or klant.get("naam") or "Onbekend"
    werf_naam = groep.get("werf_naam") or "Onbekend"
    ondertekend_door = groep.get("handtekening_naam", "Onbekend")
    week_list = ", ".join(f"W{w.get('week_nummer','?')}-{w.get('jaar','?')}" for w in werkbonnen) or "-"

    total_uren = totals.get("total_uren", 0.0)
    total_bedrag = totals.get("totaal_bedrag", 0.0)
    total_km = totals.get("km_tot", 0.0)

    subject = f"Werkbon — Periode {periode_van} t/m {periode_tot} — {werf_naam}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; }}
            .header {{ background: #1a1a2e; color: white; padding: 28px; text-align: center; border-bottom: 4px solid #F5A623; }}
            .header h1 {{ color: #F5A623; margin: 0 0 6px 0; font-size: 22px; }}
            .header p {{ color: #aaa; margin: 0; font-size: 14px; }}
            .content {{ padding: 28px; }}
            .info-box {{ background: #f8f9fa; border-left: 4px solid #F5A623; padding: 16px; margin: 20px 0; border-radius: 4px; }}
            .info-box strong {{ color: #1a1a2e; }}
            .highlight {{ color: #F5A623; font-weight: bold; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 10px 14px; text-align: left; font-size: 14px; }}
            th {{ background: #1a1a2e; color: #F5A623; font-weight: 600; }}
            .total-row {{ background: #fff3cd; font-weight: bold; }}
            .disclaimer {{ background: #eef6ff; border-left: 4px solid #1a73e8; padding: 14px 18px; margin: 24px 0; border-radius: 4px; font-size: 13px; color: #333; }}
            .footer {{ background: #f0f0f0; padding: 16px 20px; font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #ddd; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>{bedrijfsnaam}</h1>
            <p>Werkbon — Periode {periode_van} t/m {periode_tot}</p>
        </div>
        <div class="content">
            <p>Beste {klant_naam},</p>
            <p>Hierbij vindt u de ondertekende werkbon voor de periode <span class="highlight">{periode_van} t/m {periode_tot}</span> voor werf <span class="highlight">{werf_naam}</span>. Het document bundelt {len(werkbonnen)} weken in één PDF.</p>
            <div class="info-box">
                <strong>Klant:</strong> {klant_naam}<br/>
                <strong>Werf:</strong> {werf_naam}<br/>
                <strong>Periode:</strong> {periode_van} t/m {periode_tot}<br/>
                <strong>Weken:</strong> {week_list}<br/>
                <strong>Ondertekend door:</strong> {ondertekend_door}<br/>
            </div>
            <table>
                <tr><th>Omschrijving</th><th>Waarde</th></tr>
                <tr><td>Totaal uren</td><td><strong>{format_number(total_uren)}</strong></td></tr>
                {f'<tr><td>Totaal KM</td><td>{format_number(total_km)} km</td></tr>' if total_km > 0 else ''}
                <tr class="total-row"><td>Totaalbedrag</td><td>€ {total_bedrag:.2f}</td></tr>
            </table>
            <div class="disclaimer">
                <strong>Belangrijk:</strong> Gelieve uw opmerkingen binnen 5 werkdagen door te sturen naar <a href="mailto:{company_recipient}">{company_recipient}</a>.<br/>
                Zonder tegenbericht wordt deze werkbon als goedgekeurd beschouwd.
            </div>
            <p>Met vriendelijke groeten,<br/><strong>{bedrijfsnaam}</strong></p>
        </div>
        <div class="footer">
            <p>{instellingen.get('pdf_voettekst', 'Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week.')}</p>
            <p style="margin-top:8px;">Dit is een automatisch gegenereerd bericht van {bedrijfsnaam}.</p>
        </div>
    </body>
    </html>
    """

    try:
        import base64 as _b64
        pdf_b64 = _b64.b64encode(pdf_bytes).decode("ascii")
        reply_to = get_reply_to(instellingen, user_email=user_email)
        params: Dict[str, Any] = {
            "from": get_sender_email(instellingen),
            "to": recipients,
            "subject": subject,
            "html": html_content,
            "attachments": [{"filename": pdf_filename, "content": pdf_b64}],
        }
        if reply_to:
            params["reply_to"] = [reply_to]
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info("Werkbon groep email sent: %s", result)
        return {"success": True, "email_id": result.get("id"), "recipients": recipients}
    except Exception as e:
        logging.error("Failed to send werkbon groep email: %s", str(e))
        return {"success": False, "error": str(e), "recipients": recipients}


@api_router.post("/werkbon-groepen/{groep_id}/verzenden")
async def verzend_werkbon_groep(
    groep_id: str,
    klant_email: Optional[str] = Query(None),
    force: bool = Query(False),
    current_user: Dict = Depends(get_current_user),
):
    """Generate ONE combined PDF for the whole maand-werkbon, email it, and
    cascade the verzonden status to every child werkbon."""
    company_id = _require_tenant(current_user)
    groep = await db.werkbon_groepen.find_one({"id": groep_id, "company_id": company_id}, {"_id": 0})
    if not groep:
        raise HTTPException(status_code=404, detail="Werkbon groep niet gevonden")
    if not force and groep.get("status") != "ondertekend":
        raise HTTPException(status_code=400, detail="Groep moet eerst ondertekend worden")

    werkbonnen = await db.werkbonnen.find(
        {"groep_id": groep_id, "company_id": company_id}, {"_id": 0}
    ).sort([("jaar", 1), ("week_nummer", 1)]).to_list(200)
    if not werkbonnen:
        raise HTTPException(status_code=404, detail="Geen werkbonnen gekoppeld aan deze groep")

    klant = await db.klanten.find_one({"id": groep["klant_id"], "company_id": company_id}, {"_id": 0}) or {}
    werf = await db.werven.find_one({"id": groep["werf_id"], "company_id": company_id}, {"_id": 0}) or {}
    instellingen = await get_instellingen_for_company(company_id)

    # Resolve GridFS signatures/selfies before rendering.
    werkbonnen_prepared: List[dict] = []
    for w in werkbonnen:
        werkbonnen_prepared.append(await prepare_werkbon_for_pdf(w))

    # Compute periode totals up front so we can pass them to the email body
    # AND store them on the groep doc for audit.
    total_uren = 0.0
    total_bedrag = 0.0
    total_km = 0.0
    for w in werkbonnen_prepared:
        fin = compute_werkbon_financials(w, klant)
        total_uren += fin["total_uren"]
        total_bedrag += fin["totaal_bedrag"]
        total_km += fin["km_tot"]
    totals = {"total_uren": total_uren, "totaal_bedrag": total_bedrag, "km_tot": total_km}

    try:
        import gc
        gc.collect()
        pdf_bytes, pdf_filename = generate_combined_werkbon_pdf(groep, werkbonnen_prepared, klant, werf, instellingen)
        gc.collect()
    except Exception as exc:
        logging.exception("Combined PDF generation failed for groep %s", groep_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")

    # Klant copy: only if explicit param OR klant record has email on file.
    # Never invent a default address.
    klant_target = (klant_email or "").strip() or (klant.get("email") or "").strip() or None

    try:
        email_result = await send_werkbon_groep_email(
            groep,
            werkbonnen_prepared,
            klant,
            instellingen,
            pdf_bytes,
            pdf_filename,
            totals=totals,
            klant_email=klant_target,
            user_email=current_user.get("email"),
        )
    except Exception as mail_err:
        logger.error(f"Groep mail verzenden mislukt: {mail_err}")
        email_result = {"success": False, "error": str(mail_err)}

    success = bool(email_result.get("success"))
    nieuwe_status = "verzonden" if success else groep.get("status", "ondertekend")

    await db.werkbon_groepen.update_one(
        {"id": groep_id, "company_id": company_id},
        {"$set": {
            "status": nieuwe_status,
            "email_verzonden": success,
            "email_error": email_result.get("error"),
            "pdf_bestandsnaam": pdf_filename,
            "totaal_uren": total_uren,
            "totaal_bedrag": total_bedrag,
            "totaal_km": total_km,
            "updated_at": datetime.now(timezone.utc),
        }},
    )

    # Cascade: when the groep is sent, every child werkbon is sent too. Keeps
    # the per-week lists/views consistent with the bundled outbound.
    if success:
        child_ids = [w.get("id") for w in werkbonnen if w.get("id")]
        if child_ids:
            await db.werkbonnen.update_many(
                {"id": {"$in": child_ids}, "company_id": company_id},
                {"$set": {
                    "status": "verzonden",
                    "email_verzonden": True,
                    "pdf_bestandsnaam": pdf_filename,
                    "updated_at": datetime.now(timezone.utc),
                }},
            )

    return {
        "success": True,
        "status": nieuwe_status,
        "totaal_uren": total_uren,
        "totaal_bedrag": total_bedrag,
        "totaal_km": total_km,
        "pdf_filename": pdf_filename,
        "recipients": email_result.get("recipients", []),
        "email_sent": success,
        "email_error": email_result.get("error"),
        "child_werkbon_ids": [w.get("id") for w in werkbonnen],
    }


@api_router.get("/werkbon-groepen/{groep_id}/pdf")
async def get_werkbon_groep_pdf(groep_id: str, current_user: Dict = Depends(get_current_user)):
    """Preview the combined PDF without sending email — returns base64."""
    company_id = _require_tenant(current_user)
    groep = await db.werkbon_groepen.find_one({"id": groep_id, "company_id": company_id}, {"_id": 0})
    if not groep:
        raise HTTPException(status_code=404, detail="Werkbon groep niet gevonden")
    werkbonnen = await db.werkbonnen.find(
        {"groep_id": groep_id, "company_id": company_id}, {"_id": 0}
    ).sort([("jaar", 1), ("week_nummer", 1)]).to_list(200)
    klant = await db.klanten.find_one({"id": groep["klant_id"], "company_id": company_id}, {"_id": 0}) or {}
    werf = await db.werven.find_one({"id": groep["werf_id"], "company_id": company_id}, {"_id": 0}) or {}
    instellingen = await get_instellingen_for_company(company_id)
    werkbonnen_prepared = [await prepare_werkbon_for_pdf(w) for w in werkbonnen]
    pdf_bytes, pdf_filename = generate_combined_werkbon_pdf(groep, werkbonnen_prepared, klant, werf, instellingen)
    import base64 as _b64
    return {"filename": pdf_filename, "pdf_base64": _b64.b64encode(pdf_bytes).decode("ascii")}


@api_router.get("/werkbonnen/{werkbon_id}/pdf")
async def get_werkbon_pdf(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    """Generate and return werkbon PDF as base64. Strict tenant scope on every
    document the PDF renders — werkbon, klant, werf, AND instellingen — so a
    Signybon customer can never see another tenant's data even by guessing IDs."""
    company_id = _require_tenant(current_user)
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

    klant = await db.klanten.find_one({"id": werkbon["klant_id"], "company_id": company_id}, {"_id": 0}) or {}
    werf = await db.werven.find_one({"id": werkbon["werf_id"], "company_id": company_id}, {"_id": 0}) or {}
    instellingen = await get_instellingen_for_company(company_id)

    fin = compute_werkbon_financials(werkbon, klant)
    total_uren = fin["total_uren"]
    uurtarief = fin["uurtarief"]
    totaal_bedrag = fin["totaal_bedrag"]

    try:
        pdf_bytes, pdf_filename = generate_werkbon_pdf(werkbon, klant, werf, instellingen, total_uren, totaal_bedrag)
    except Exception as exc:
        logging.exception("PDF generation failed for werkbon %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")
    
    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return {"pdf_base64": pdf_base64, "pdf_filename": pdf_filename}

# ==================== RAPPORT ROUTES ====================

@api_router.get("/rapporten/uren")
async def get_uren_rapport(jaar: int, week: Optional[int] = None, maand: Optional[int] = None):
    """Get hours report per worker for a given period (week or month)."""
    import calendar
    query: Dict = {"jaar": jaar}
    if week is not None:
        query["week_nummer"] = week
    elif maand is not None:
        weeks: set = set()
        _, num_days = calendar.monthrange(jaar, maand)
        for day in range(1, num_days + 1):
            d = datetime(jaar, maand, day)
            weeks.add(d.isocalendar()[1])
        query["week_nummer"] = {"$in": list(weeks)}

    werkbonnen = await db.werkbonnen.find(query, {"_id": 0}).to_list(1000)
    rapport: Dict[str, dict] = {}

    for wb in werkbonnen:
        week_num = wb.get("week_nummer")
        for uren_regel in wb.get("uren", []):
            naam = (uren_regel.get("teamlid_naam") or "").strip()
            if not naam:
                continue
            werf = wb.get("werf_naam", "")
            dag_namen = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
            dag_kort = ["ma", "di", "wo", "do", "vr", "za", "zo"]
            day_values = {}
            total = 0.0
            for dag, kort in zip(dag_namen, dag_kort):
                afk = uren_regel.get(f"afkorting_{kort}", "")
                uren = uren_regel.get(dag, 0) or 0
                day_values[dag] = afk if afk else (uren if uren > 0 else 0)
                if not afk:
                    total += uren

            if naam not in rapport:
                rapport[naam] = {"werknemer_naam": naam, "werven": {}, "totaal_uren": 0.0}
            if werf not in rapport[naam]["werven"]:
                rapport[naam]["werven"][werf] = {"uren": 0.0, "week_details": []}
            rapport[naam]["werven"][werf]["uren"] += total
            rapport[naam]["werven"][werf]["week_details"].append({
                "week_nummer": week_num,
                **{d: day_values[d] for d in dag_namen},
                "totaal": total,
            })
            rapport[naam]["totaal_uren"] += total

    result = [
        {
            "werknemer_naam": naam,
            "werven": [
                {"werf_naam": k, "uren": v["uren"], "week_details": v["week_details"]}
                for k, v in sorted(d["werven"].items())
            ],
            "totaal_uren": d["totaal_uren"],
        }
        for naam, d in rapport.items()
    ]
    result.sort(key=lambda x: x["totaal_uren"], reverse=True)
    return result


@api_router.get("/rapporten/csv-export")
async def get_csv_export(jaar: int, week: Optional[int] = None, maand: Optional[int] = None):
    """
    Export werkbonnen data as clean CSV format.
    Columns: Datum, Werknemer, Team, Klant, Werf, Werkbon Type, Uren, Status, Handtekening, Opmerkingen
    """
    import calendar
    from fastapi.responses import Response
    import csv
    from io import StringIO
    
    query: Dict = {"jaar": jaar}
    if week is not None:
        query["week_nummer"] = week
    elif maand is not None:
        weeks: set = set()
        _, num_days = calendar.monthrange(jaar, maand)
        for day in range(1, num_days + 1):
            d = datetime(jaar, maand, day)
            weeks.add(d.isocalendar()[1])
        query["week_nummer"] = {"$in": list(weeks)}
    
    werkbonnen = await db.werkbonnen.find(query, {"_id": 0}).to_list(1000)
    
    # Get team information for workers
    teams = await db.teams.find({}, {"_id": 0}).to_list(100)
    team_lookup = {}
    for team in teams:
        for lid in team.get("leden", []):
            team_lookup[lid.get("werknemer_id")] = team.get("naam", "")
    
    # Build CSV data
    output = StringIO()
    writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
    
    # Header row
    writer.writerow([
        "Datum", "Week", "Werknemer", "Team", "Klant", "Werf", 
        "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo", "Totaal Uren",
        "Status", "Handtekening", "Opmerkingen"
    ])
    
    # Data rows
    for wb in werkbonnen:
        week_num = wb.get("week_nummer", "")
        klant = wb.get("klant_naam", "")
        werf = wb.get("werf_naam", "")
        status = wb.get("status", "concept").capitalize()
        has_signature = "Ja" if wb.get("handtekening_data") else "Nee"
        datum_maandag = wb.get("datum_maandag", "")
        opmerkingen = (wb.get("uitgevoerde_werken", "") or "")[:100]  # Truncate to 100 chars
        
        for uren_regel in wb.get("uren", []):
            werknemer_id = uren_regel.get("teamlid_id", "")
            werknemer_naam = uren_regel.get("teamlid_naam", "")
            team_naam = team_lookup.get(werknemer_id, "")
            
            dag_namen = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]
            dag_kort = ["ma", "di", "wo", "do", "vr", "za", "zo"]
            day_values = []
            total = 0.0
            
            for dag, kort in zip(dag_namen, dag_kort):
                afk = uren_regel.get(f"afkorting_{kort}", "")
                uren = uren_regel.get(dag, 0) or 0
                if afk:
                    day_values.append(afk)
                elif uren > 0:
                    day_values.append(str(uren))
                    total += uren
                else:
                    day_values.append("")
            
            writer.writerow([
                datum_maandag,
                f"Week {week_num}",
                werknemer_naam,
                team_naam,
                klant,
                werf,
                *day_values,
                str(total) if total > 0 else "",
                status,
                has_signature,
                opmerkingen.replace('\n', ' ')
            ])
    
    csv_content = output.getvalue()
    
    # Return as downloadable CSV file
    filename = f"werkbonnen_export_{jaar}"
    if week:
        filename += f"_week{week}"
    elif maand:
        filename += f"_maand{maand}"
    filename += ".csv"
    
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )



# ==================== HEALTH CHECK ====================

# ==================== OPLEVERING WERKBON ROUTES ====================

@api_router.get("/oplevering-werkbonnen")
async def get_oplevering_werkbonnen(user_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    user = await db.users.find_one({"id": user_id, "company_id": company_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    # V1: Web panel users see all (within tenant), mobile users see only their own
    base = {"company_id": company_id}
    if not has_web_access(user.get("rol", "")):
        base["ingevuld_door_id"] = user_id
    items = await db.oplevering_werkbonnen.find(base, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/oplevering-werkbonnen/{werkbon_id}")
async def get_oplevering_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    item = await db.oplevering_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    return item

@api_router.post("/oplevering-werkbonnen")
async def create_oplevering_werkbon(
    data: OpleveringWerkbonCreate,
    current_user: Dict = Depends(get_current_user)
):
    """Create oplevering werkbon - uses authenticated user's identity from JWT"""
    final_user_id = current_user["user_id"]
    final_user_naam = current_user["naam"]
    company_id = _require_tenant(current_user)
    _sub_o, plan_o, _co_o = await _resolve_company_plan(company_id)
    _require_werkbon_type(plan_o, "oplevering")

    validate_oplevering_payload(data)
    klant = await db.klanten.find_one({"id": data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": data.werf_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    # Process photos - store in GridFS and keep only file_ids (max 3, skip >5MB)
    processed_fotos = []
    for i, foto in enumerate(data.fotos or []):
        if len(processed_fotos) >= 3:
            break
        try:
            base64_data = foto if isinstance(foto, str) else ""
            if base64_data and len(base64_data) > 100:  # Has actual image data
                raw_b64 = base64_data.split(",", 1)[-1] if "," in base64_data else base64_data
                if len(raw_b64) * 3 // 4 > 5 * 1024 * 1024:
                    logging.warning(f"[oplevering save] Skipping photo {i}: exceeds 5MB limit")
                    continue
                file_id = await store_base64_to_gridfs(
                    base64_data,
                    f"oplevering_foto_{final_user_id}_{i}_{uuid.uuid4().hex[:8]}.jpg",
                    "image/jpeg"
                )
                processed_fotos.append(file_id)  # Just store file_id as string
        except Exception as e:
            logging.error(f"Failed to store oplevering photo {i} to GridFS: {e}")
    
    # Process handtekening_klant - store in GridFS
    handtekening_klant_file_id = None
    if data.handtekening_klant and len(data.handtekening_klant) > 100:
        try:
            handtekening_klant_file_id = await store_base64_to_gridfs(
                data.handtekening_klant,
                f"handtekening_klant_oplevering_{final_user_id}_{uuid.uuid4().hex[:8]}.png",
                "image/png"
            )
        except Exception as e:
            logging.error(f"Failed to store client signature to GridFS: {e}")
    
    # Process handtekening_monteur - store in GridFS
    handtekening_monteur_file_id = None
    if data.handtekening_monteur and len(data.handtekening_monteur) > 100:
        try:
            handtekening_monteur_file_id = await store_base64_to_gridfs(
                data.handtekening_monteur,
                f"handtekening_monteur_oplevering_{final_user_id}_{uuid.uuid4().hex[:8]}.png",
                "image/png"
            )
        except Exception as e:
            logging.error(f"Failed to store technician signature to GridFS: {e}")
    
    # Process selfie_foto - store in GridFS
    selfie_file_id = None
    if data.selfie_foto and len(data.selfie_foto) > 100:
        try:
            selfie_file_id = await store_base64_to_gridfs(
                data.selfie_foto,
                f"selfie_oplevering_{final_user_id}_{uuid.uuid4().hex[:8]}.jpg",
                "image/jpeg"
            )
        except Exception as e:
            logging.error(f"Failed to store selfie to GridFS: {e}")
    
    werkbon_dict = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": "oplevering",
        "klant_id": data.klant_id,
        "klant_naam": klant.get("naam") or klant.get("bedrijfsnaam", ""),
        "klant_email": klant.get("email") or klant.get("algemeen_email", ""),
        "klant_telefoon": klant.get("telefoon") or klant.get("algemeen_telefoon", ""),
        "werf_id": data.werf_id,
        "werf_naam": werf["naam"],
        "werf_adres": werf.get("adres", ""),
        "datum": data.datum,
        "installatie_type": data.installatie_type,
        "werk_beschrijving": data.werk_beschrijving,
        "gebruikte_materialen": data.gebruikte_materialen,
        "extra_opmerkingen": data.extra_opmerkingen,
        "schade_status": data.schade_status,
        "schade_opmerking": data.schade_opmerking,
        "schade_checks": [c.dict() if hasattr(c, 'dict') else c for c in (data.schade_checks or [
            SchadeCheck(label="Geen schade", checked=data.schade_status == "geen_schade"),
            SchadeCheck(label="Schade aanwezig", checked=data.schade_status == "schade_aanwezig", opmerking=data.schade_opmerking),
        ])],
        "alles_ok": data.alles_ok,
        "beoordelingen": [b.dict() if hasattr(b, 'dict') else b for b in (data.beoordelingen or [])],
        "fotos": processed_fotos,  # Now contains GridFS file_ids
        "foto_labels": data.foto_labels,
        "handtekening_klant": handtekening_klant_file_id,  # GridFS file_id
        "handtekening_klant_naam": data.handtekening_klant_naam,
        "handtekening_monteur": handtekening_monteur_file_id,  # GridFS file_id
        "handtekening_monteur_naam": data.handtekening_monteur_naam or final_user_naam,
        "handtekening_datum": datetime.now(timezone.utc),
        "selfie_foto": selfie_file_id,  # GridFS file_id
        "gps_locatie": data.gps_locatie,
        "verstuur_naar_klant": data.verstuur_naar_klant,
        "klant_email_override": (data.klant_email_override or klant.get("email") or klant.get("algemeen_email") or "").strip(),
        "ingevuld_door_id": final_user_id,
        "ingevuld_door_naam": final_user_naam,
        "status": "ondertekend",
        "email_verzonden": False,
        "pdf_bestandsnaam": None,
        "email_error": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    
    await db.oplevering_werkbonnen.insert_one(werkbon_dict)
    return serialize_mongo_doc(werkbon_dict)

@api_router.put("/oplevering-werkbonnen/{werkbon_id}")
async def update_oplevering_werkbon(werkbon_id: str, update_data: OpleveringWerkbonUpdate, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)

    if update_data.handtekening_klant:
        update_dict["handtekening_datum"] = datetime.now(timezone.utc)
        update_dict["status"] = "ondertekend"

    # Convert nested models to dicts
    if "schade_checks" in update_dict:
        update_dict["schade_checks"] = [c.dict() if hasattr(c, 'dict') else c for c in update_dict["schade_checks"]]
    if "beoordelingen" in update_dict:
        update_dict["beoordelingen"] = [b.dict() if hasattr(b, 'dict') else b for b in update_dict["beoordelingen"]]

    result = await db.oplevering_werkbonnen.update_one({"id": werkbon_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    updated = await db.oplevering_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    return updated


@api_router.post("/oplevering-werkbonnen/{werkbon_id}/verzenden")
async def verzend_oplevering_werkbon(
    werkbon_id: str,
    klant_email: Optional[str] = Query(None),
    force: bool = Query(False),
    current_user: Dict = Depends(get_current_user),
):
    company_id = _require_tenant(current_user)
    werkbon = await db.oplevering_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")

    if not force and (not werkbon.get("handtekening_klant") or not werkbon.get("handtekening_klant_naam")):
        raise HTTPException(status_code=400, detail="Oplevering werkbon moet eerst door de klant ondertekend worden")

    if not force and werkbon.get("schade_status") == "schade_aanwezig" and not werkbon.get("fotos"):
        raise HTTPException(status_code=400, detail="Bij schade is minimaal 1 foto verplicht")

    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)

    instellingen = await get_instellingen_for_company(company_id)

    try:
        import gc
        gc.collect()  # Free memory before PDF generation
        pdf_bytes, pdf_filename = generate_oplevering_pdf(werkbon_prepared, instellingen)
        gc.collect()  # Free memory after PDF generation
    except Exception as exc:
        logging.exception("Oplevering PDF generation failed for %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")

    override_email = (klant_email or werkbon.get("klant_email_override") or werkbon.get("klant_email") or "").strip()
    email_result = await send_oplevering_email(
        werkbon,
        instellingen,
        pdf_bytes,
        pdf_filename,
        klant_email=override_email,
        user_email=current_user.get("email"),
    )
    nieuwe_status = "verzonden" if email_result.get("success") else werkbon.get("status", "ondertekend")

    await db.oplevering_werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": {
            "status": nieuwe_status,
            "email_verzonden": email_result.get("success", False),
            "email_error": email_result.get("error"),
            "pdf_bestandsnaam": pdf_filename,
            "klant_email_override": override_email,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    return {
        "message": "Oplevering werkbon als PDF verzonden" if email_result.get("success") else "PDF gemaakt, maar e-mail kon niet worden verzonden",
        "status": nieuwe_status,
        "pdf_filename": pdf_filename,
        "recipients": email_result.get("recipients", []),
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "success": True,
    }

@api_router.delete("/oplevering-werkbonnen/{werkbon_id}")
async def delete_oplevering_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    result = await db.oplevering_werkbonnen.delete_one({"id": werkbon_id, "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    return {"message": "Oplevering werkbon verwijderd"}

# ==================== PROJECT WERKBON ROUTES ====================

@api_router.get("/project-werkbonnen")
async def get_project_werkbonnen(user_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    user = await db.users.find_one({"id": user_id, "company_id": company_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    # V1: Web panel users see all (within tenant), mobile users see only their own
    base = {"company_id": company_id}
    if not has_web_access(user.get("rol", "")):
        base["ingevuld_door_id"] = user_id
    items = await db.project_werkbonnen.find(base, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/project-werkbonnen/{werkbon_id}")
async def get_project_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    item = await db.project_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    return item

@api_router.post("/project-werkbonnen")
async def create_project_werkbon(
    data: ProjectWerkbonCreate,
    current_user: Dict = Depends(get_current_user)
):
    """Create project werkbon - uses authenticated user's identity from JWT"""
    final_user_id = current_user["user_id"]
    final_user_naam = current_user["naam"]
    company_id = _require_tenant(current_user)
    _sub_pr, plan_pr, _co_pr = await _resolve_company_plan(company_id)
    _require_werkbon_type(plan_pr, "project")

    klant = await db.klanten.find_one({"id": data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": data.werf_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    dag_regels, totaal = normalize_project_day_rows(data)
    feedback_items = normalize_project_feedback_items(data.klant_feedback_items)
    klant_email = (data.klant_email_override or klant.get("email") or klant.get("algemeen_email") or "").strip()
    if not data.handtekening_klant or not data.handtekening_klant_naam.strip():
        raise HTTPException(status_code=400, detail="Klant handtekening en naam zijn verplicht")
    if data.klant_prestatie_score < 1 or data.klant_prestatie_score > 3:
        raise HTTPException(status_code=400, detail="Geef een algemene score van 1 tot 3 sterren")
    if data.verstuur_naar_klant and not klant_email:
        raise HTTPException(status_code=400, detail="Klant e-mail is verplicht wanneer u naar de klant wilt sturen")
    
    # Process handtekening_klant - store in GridFS
    handtekening_klant_file_id = None
    if data.handtekening_klant and len(data.handtekening_klant) > 100:
        try:
            handtekening_klant_file_id = await store_base64_to_gridfs(
                data.handtekening_klant,
                f"handtekening_klant_project_{final_user_id}_{uuid.uuid4().hex[:8]}.png",
                "image/png"
            )
        except Exception as e:
            logging.error(f"Failed to store project client signature to GridFS: {e}")
            # Continue with base64 if GridFS fails
            handtekening_klant_file_id = data.handtekening_klant
    
    werkbon_dict = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": "project",
        "klant_id": data.klant_id,
        "klant_naam": klant.get("naam") or klant.get("bedrijfsnaam", ""),
        "werf_id": data.werf_id,
        "werf_naam": werf["naam"],
        "werf_adres": werf.get("adres", ""),
        "datum": dag_regels[0]["datum"],
        "start_tijd": dag_regels[0]["start_tijd"],
        "stop_tijd": dag_regels[0]["stop_tijd"],
        "pauze_minuten": dag_regels[0]["pauze_minuten"],
        "totaal_uren": round(totaal, 2),
        "werk_beschrijving": data.werk_beschrijving,
        "extra_opmerkingen": data.extra_opmerkingen,
        "dag_regels": dag_regels,
        "klant_feedback_items": feedback_items,
        "klant_feedback_opmerking": data.klant_feedback_opmerking,
        "klant_prestatie_score": data.klant_prestatie_score,
        "handtekening_klant": handtekening_klant_file_id,  # GridFS file_id
        "handtekening_klant_naam": data.handtekening_klant_naam,
        "handtekening_monteur": None,
        "handtekening_monteur_naam": data.handtekening_monteur_naam or final_user_naam,
        "handtekening_datum": datetime.now(timezone.utc),
        "klant_email_override": klant_email,
        "verstuur_naar_klant": data.verstuur_naar_klant,
        "ingevuld_door_id": final_user_id,
        "ingevuld_door_naam": final_user_naam,
        "status": "ondertekend",
        "email_verzonden": False,
        "pdf_bestandsnaam": None,
        "email_error": None,
        "locatie_start": None,
        "locatie_stop": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    
    await db.project_werkbonnen.insert_one(werkbon_dict)
    return serialize_mongo_doc(werkbon_dict)

@api_router.put("/project-werkbonnen/{werkbon_id}")
async def update_project_werkbon(werkbon_id: str, update_data: ProjectWerkbonUpdate, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)

    if update_data.handtekening_klant:
        update_dict["handtekening_datum"] = datetime.now(timezone.utc)
        update_dict["status"] = "ondertekend"

    # Recalculate hours if times changed (tenant-scoped)
    existing = await db.project_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if existing:
        merged = {**existing, **update_dict}
        dag_regels, totaal = normalize_project_day_rows(merged)
        update_dict["dag_regels"] = dag_regels
        update_dict["totaal_uren"] = totaal
        update_dict["datum"] = dag_regels[0]["datum"]
        update_dict["start_tijd"] = dag_regels[0]["start_tijd"]
        update_dict["stop_tijd"] = dag_regels[0]["stop_tijd"]
        update_dict["pauze_minuten"] = dag_regels[0]["pauze_minuten"]
        if "klant_feedback_items" in update_dict:
            update_dict["klant_feedback_items"] = normalize_project_feedback_items(update_dict.get("klant_feedback_items"))

    result = await db.project_werkbonnen.update_one({"id": werkbon_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    updated = await db.project_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    return updated


@api_router.post("/project-werkbonnen/{werkbon_id}/verzenden")
async def verzend_project_werkbon(
    werkbon_id: str,
    klant_email: Optional[str] = Query(None),
    force: bool = Query(False),
    current_user: Dict = Depends(get_current_user),
):
    company_id = _require_tenant(current_user)
    werkbon = await db.project_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    if not force and (not werkbon.get("handtekening_klant") or not werkbon.get("handtekening_klant_naam")):
        raise HTTPException(status_code=400, detail="Project werkbon moet eerst ondertekend worden")

    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)

    instellingen = await get_instellingen_for_company(company_id)

    import gc
    gc.collect()  # Free memory before PDF generation
    pdf_bytes, pdf_filename = generate_project_werkbon_pdf(werkbon_prepared, instellingen)
    gc.collect()  # Free memory after PDF generation

    override_email = (klant_email or werkbon.get("klant_email_override") or "").strip()
    email_result = await send_project_werkbon_email(
        werkbon,
        instellingen,
        pdf_bytes,
        pdf_filename,
        klant_email=override_email,
        user_email=current_user.get("email"),
    )

    await db.project_werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": {
            "status": "verzonden" if email_result.get("success") else werkbon.get("status", "ondertekend"),
            "email_verzonden": email_result.get("success", False),
            "email_error": email_result.get("error"),
            "pdf_bestandsnaam": pdf_filename,
            "klant_email_override": override_email,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    return {
        "success": True,
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "pdf_filename": pdf_filename,
        "recipients": email_result.get("recipients", []),
    }

@api_router.delete("/project-werkbonnen/{werkbon_id}")
async def delete_project_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    result = await db.project_werkbonnen.delete_one({"id": werkbon_id, "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    return {"message": "Project werkbon verwijderd"}

# ==================== PRODUCTIE WERKBON ROUTES ====================

@api_router.get("/productie-werkbonnen")
async def get_productie_werkbonnen(user_id: str, is_admin: bool = False, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    if is_admin:
        items = await db.productie_werkbonnen.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return items
    user = await db.users.find_one({"id": user_id, "company_id": company_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    # V1: Use has_web_access for admin check instead of hardcoded list
    base = {"company_id": company_id}
    if not has_web_access(user.get("rol", "")):
        base["ingevuld_door_id"] = user_id
    items = await db.productie_werkbonnen.find(base, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/productie-werkbonnen/{werkbon_id}")
async def get_productie_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    item = await db.productie_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    return item

@api_router.post("/productie-werkbonnen")
async def create_productie_werkbon(
    data: ProductieWerkbonCreate,
    current_user: Dict = Depends(get_current_user)
):
    """Create productie werkbon - uses authenticated user's identity from JWT"""
    final_user_id = current_user["user_id"]
    final_user_naam = current_user["naam"]
    company_id = _require_tenant(current_user)
    _sub_pe, plan_pe, _co_pe = await _resolve_company_plan(company_id)
    _require_werkbon_type(plan_pe, "prestatie")

    klant = await db.klanten.find_one({"id": data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": data.werf_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")

    # Process photos - store in GridFS and keep only file_ids (max 3, skip >5MB)
    processed_fotos = []
    for i, foto in enumerate(data.fotos or []):
        if len(processed_fotos) >= 3:
            break
        try:
            base64_data = foto.get("base64", "") if isinstance(foto, dict) else str(foto)
            if base64_data and len(base64_data) > 100:  # Has actual image data
                raw_b64 = base64_data.split(",", 1)[-1] if "," in base64_data else base64_data
                if len(raw_b64) * 3 // 4 > 5 * 1024 * 1024:
                    logging.warning(f"[productie save] Skipping photo {i}: exceeds 5MB limit")
                    continue
                file_id = await store_base64_to_gridfs(
                    base64_data,
                    f"productie_foto_{final_user_id}_{i}_{uuid.uuid4().hex[:8]}.jpg",
                    "image/jpeg"
                )
                processed_fotos.append({
                    "file_id": file_id,
                    "timestamp": foto.get("timestamp", "") if isinstance(foto, dict) else "",
                    "werknemer_id": foto.get("werknemer_id", final_user_id) if isinstance(foto, dict) else final_user_id,
                    "gps": foto.get("gps", "") if isinstance(foto, dict) else "",
                })
        except Exception as e:
            logging.error(f"Failed to store photo {i} to GridFS: {e}")
            # Continue with other photos
    
    # Process signature - store in GridFS
    handtekening_file_id = None
    if data.handtekening and len(data.handtekening) > 100:
        try:
            handtekening_file_id = await store_base64_to_gridfs(
                data.handtekening,
                f"handtekening_productie_{final_user_id}_{uuid.uuid4().hex[:8]}.png",
                "image/png"
            )
        except Exception as e:
            logging.error(f"Failed to store signature to GridFS: {e}")
    
    # Process selfie - store in GridFS
    selfie_file_id = None
    if data.selfie_foto and len(data.selfie_foto) > 100:
        try:
            selfie_file_id = await store_base64_to_gridfs(
                data.selfie_foto,
                f"selfie_productie_{final_user_id}_{uuid.uuid4().hex[:8]}.jpg",
                "image/jpeg"
            )
        except Exception as e:
            logging.error(f"Failed to store selfie to GridFS: {e}")

    totaal_m2 = round(float(data.gelijkvloers_m2) + float(data.eerste_verdiep_m2) + float(data.tweede_verdiep_m2), 2)
    
    werkbon_dict = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": "productie",
        "datum": data.datum,
        "werknemer_naam": data.werknemer_naam or final_user_naam,
        "werknemer_id": data.werknemer_id or final_user_id,
        "klant_id": data.klant_id,
        "klant_naam": klant.get("naam") or klant.get("bedrijfsnaam", ""),
        "werf_id": data.werf_id,
        "werf_naam": werf["naam"],
        "werf_adres": werf.get("adres", ""),
        "start_uur": data.start_uur,
        "eind_uur": data.eind_uur,
        "voorziene_uur": data.voorziene_uur,
        "uit_te_voeren_werk": data.uit_te_voeren_werk,
        "nodige_materiaal": data.nodige_materiaal,
        "gelijkvloers_m2": data.gelijkvloers_m2,
        "gelijkvloers_cm": data.gelijkvloers_cm,
        "eerste_verdiep_m2": data.eerste_verdiep_m2,
        "eerste_verdiep_cm": data.eerste_verdiep_cm,
        "tweede_verdiep_m2": data.tweede_verdiep_m2,
        "tweede_verdiep_cm": data.tweede_verdiep_cm,
        "totaal_m2": totaal_m2,
        "schuurwerken": data.schuurwerken,
        "schuurwerken_m2": data.schuurwerken_m2,
        "stofzuigen": data.stofzuigen,
        "stofzuigen_m2": data.stofzuigen_m2,
        "fotos": processed_fotos,  # Now contains file_ids instead of base64
        "opmerking": data.opmerking,
        "gps_locatie": data.gps_locatie,
        "handtekening": handtekening_file_id,  # GridFS file_id instead of base64
        "handtekening_naam": data.handtekening_naam,
        "handtekening_datum": data.handtekening_datum,
        "selfie_foto": selfie_file_id,  # GridFS file_id instead of base64
        "verstuur_naar_klant": data.verstuur_naar_klant,
        "klant_email_override": (data.klant_email_override or klant.get("email") or klant.get("algemeen_email") or "").strip(),
        "ingevuld_door_id": user_id,
        "ingevuld_door_naam": user_naam,
        "status": "ondertekend",
        "email_verzonden": False,
        "pdf_bestandsnaam": None,
        "email_error": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    
    await db.productie_werkbonnen.insert_one(werkbon_dict)
    return serialize_mongo_doc(werkbon_dict)

@api_router.post("/productie-werkbonnen/{werkbon_id}/verzenden")
async def verzend_productie_werkbon(
    werkbon_id: str,
    klant_email: Optional[str] = Query(None),
    current_user: Dict = Depends(get_current_user),
):
    company_id = _require_tenant(current_user)
    werkbon = await db.productie_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")

    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)

    instellingen = await get_instellingen_for_company(company_id)
    try:
        import gc
        gc.collect()  # Free memory before PDF generation
        pdf_bytes, pdf_filename = generate_productie_pdf(werkbon_prepared, instellingen)
        gc.collect()  # Free memory after PDF generation
    except Exception as exc:
        logging.exception("Productie PDF generation failed for %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")

    override_email = (klant_email or werkbon.get("klant_email_override") or "").strip()
    email_result = await send_productie_werkbon_email(
        werkbon,
        instellingen,
        pdf_bytes,
        pdf_filename,
        klant_email=override_email,
        user_email=current_user.get("email"),
    )
    await db.productie_werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": {
            "status": "verzonden" if email_result.get("success") else werkbon.get("status", "ondertekend"),
            "email_verzonden": email_result.get("success", False),
            "email_error": email_result.get("error"),
            "pdf_bestandsnaam": pdf_filename,
            "updated_at": datetime.now(timezone.utc),
        }}
    )
    return {
        "success": True,
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "pdf_filename": pdf_filename,
        "recipients": email_result.get("recipients", []),
    }

@api_router.get("/productie-werkbonnen/{werkbon_id}/pdf")
async def get_productie_werkbon_pdf(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    werkbon = await db.productie_werkbonnen.find_one({"id": werkbon_id, "company_id": company_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")

    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)

    instellingen = await get_instellingen_for_company(company_id)
    try:
        pdf_bytes, pdf_filename = generate_productie_pdf(werkbon_prepared, instellingen)
    except Exception as exc:
        logging.exception("Productie PDF generation failed for %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")
    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return {"pdf_base64": pdf_base64, "pdf_filename": pdf_filename}

@api_router.delete("/productie-werkbonnen/{werkbon_id}")
async def delete_productie_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    result = await db.productie_werkbonnen.delete_one({"id": werkbon_id, "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    return {"message": "Productie werkbon verwijderd"}

# ==================== PLANNING ROUTES ====================

@api_router.get("/planning")
async def get_planning(week_nummer: int, jaar: int, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    q = _company_scope_query(company_id, {"week_nummer": week_nummer, "jaar": jaar})
    items = await db.planning.find(q, {"_id": 0}).sort("dag", 1).to_list(500)
    return items

@api_router.get("/planning/werknemer/{werknemer_id}")
async def get_planning_werknemer(werknemer_id: str, week_nummer: Optional[int] = None, jaar: Optional[int] = None, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    base = {"werknemer_ids": werknemer_id}
    if week_nummer is not None:
        base["week_nummer"] = week_nummer
    if jaar is not None:
        base["jaar"] = jaar
    q = _company_scope_query(company_id, base)
    items = await db.planning.find(q, {"_id": 0}).sort([("jaar", -1), ("week_nummer", -1), ("dag", 1)]).to_list(500)
    return items

@api_router.get("/planning/{planning_id}")
async def get_planning_item(planning_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    item = await db.planning.find_one({"id": planning_id, "company_id": company_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")
    return item

@api_router.post("/planning/bulk")
async def create_planning_bulk(data: PlanningBulkCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create planning items for multiple days in one request — sends one push notification"""
    try:
        return await _create_planning_bulk_impl(data, current_user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "[planning/bulk] save failed | company=%s user=%s klant=%s werf=%s dagen=%s werknemers=%s err=%s",
            current_user.get("company_id"),
            current_user.get("user_id"),
            getattr(data, "klant_id", None),
            getattr(data, "werf_id", None),
            getattr(data, "dagen", None),
            getattr(data, "werknemer_ids", None),
            exc,
        )
        raise HTTPException(status_code=500, detail=f"Planning kon niet worden opgeslagen: {exc}")


async def _create_planning_bulk_impl(data: PlanningBulkCreate, current_user: Dict):
    company_id = _require_tenant(current_user)
    klant = await db.klanten.find_one({"id": data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": data.werf_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")

    werknemer_namen = list(data.werknemer_namen)
    if data.werknemer_ids and not werknemer_namen:
        for wid in data.werknemer_ids:
            user = await db.users.find_one({"id": wid, "company_id": company_id})
            if user:
                werknemer_namen.append(user["naam"])

    team_naam = None
    if data.team_id:
        team = await db.teams.find_one({"id": data.team_id, "company_id": company_id})
        if team:
            team_naam = team["naam"]

    created_items = []
    waarschuwingen = []

    for dag in data.dagen:
        for wid in data.werknemer_ids:
            existing = await db.planning.find_one({
                "company_id": company_id,
                "werknemer_ids": wid,
                "week_nummer": data.week_nummer,
                "jaar": data.jaar,
                "dag": dag,
            })
            if existing:
                user = await db.users.find_one({"id": wid, "company_id": company_id})
                naam = user["naam"] if user else wid
                waarschuwingen.append(f"{naam} is al ingepland op {dag}")

        item = PlanningItem(
            week_nummer=data.week_nummer,
            jaar=data.jaar,
            dag=dag,
            datum=data.datums.get(dag, ""),
            start_uur=data.start_uur or "",
            eind_uur=data.eind_uur or "",
            voorziene_uur=data.voorziene_uur or "",
            werknemer_ids=data.werknemer_ids,
            werknemer_namen=werknemer_namen,
            team_id=data.team_id,
            team_naam=team_naam,
            klant_id=data.klant_id,
            klant_naam=klant["naam"],
            werf_id=data.werf_id,
            werf_naam=werf["naam"],
            werf_adres=werf.get("adres", ""),
            omschrijving=data.omschrijving,
            materiaallijst=data.materiaallijst,
            nodige_materiaal=data.nodige_materiaal or "\n".join(data.materiaallijst),
            opmerking_aandachtspunt=data.opmerking_aandachtspunt or "",
            geschatte_duur=data.geschatte_duur or data.voorziene_uur or "",
            prioriteit=data.prioriteit,
            belangrijk=data.belangrijk,
            notities=data.notities,
        )
        item_doc = item.dict()
        item_doc["company_id"] = _require_tenant(current_user)
        await db.planning.insert_one(item_doc)
        # pymongo mutates item_doc in place to add _id (ObjectId) — strip
        # Mongo-only fields so the response can be JSON-serialized.
        created_items.append(serialize_mongo_doc(item_doc))

    # Send ONE push notification for all days combined
    if data.werknemer_ids and created_items:
        try:
            dagen_str = ", ".join(data.dagen)
            await send_push_notifications(
                data.werknemer_ids,
                "Nieuwe planning",
                f"U bent ingepland bij {klant['naam']} - {werf['naam']} op {dagen_str}",
                {"type": "planning"}
            )
        except Exception as e:
            logging.error(f"Push notification failed: {e}")

    result: Dict[str, Any] = {"items": created_items, "count": len(created_items)}
    if waarschuwingen:
        result["waarschuwingen"] = waarschuwingen
    return result


# ── Maand (multi-week) planning ───────────────────────────────────────────────
# Dutch ISO weekday names used throughout the planning data model.
_DAGEN_NL = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]


def _split_date_range_into_iso_weeks(
    van: "date",
    tot: "date",
    skip_weekend: bool = False,
) -> List[Dict[str, Any]]:
    """Walk every day in [van, tot] (inclusive) and group by ISO week.

    Returns a list of {week_nummer, jaar, dagen[], datums{}} dicts ordered by
    (jaar, week_nummer). 'datums' is keyed by the Dutch weekday name with the
    DD-MM-YYYY format the rest of the planning model already uses.
    """
    from datetime import timedelta as _td
    if tot < van:
        return []
    buckets: Dict[Tuple[int, int], Dict[str, Any]] = {}
    cur = van
    while cur <= tot:
        iso_year, iso_week, iso_weekday = cur.isocalendar()  # weekday: 1=Mon..7=Sun
        if skip_weekend and iso_weekday >= 6:
            cur = cur + _td(days=1)
            continue
        dag_naam = _DAGEN_NL[iso_weekday - 1]
        datum_str = cur.strftime("%d-%m-%Y")
        key = (iso_year, iso_week)
        bucket = buckets.get(key)
        if not bucket:
            bucket = {"jaar": iso_year, "week_nummer": iso_week, "dagen": [], "datums": {}}
            buckets[key] = bucket
        # Same ISO weekday twice in one range is impossible by definition,
        # so we can just append.
        bucket["dagen"].append(dag_naam)
        bucket["datums"][dag_naam] = datum_str
        cur = cur + _td(days=1)
    return [buckets[k] for k in sorted(buckets.keys())]


@api_router.post("/planning/maand-bulk")
async def create_planning_maand_bulk(
    data: PlanningMaandBulkCreate,
    current_user: Dict = Depends(require_roles(["admin", "master_admin"])),
):
    """Create planning items spanning multiple ISO weeks AND a WerkbonGroep
    that will later bundle each week's werkbon into a single PDF + email.

    The frontend picks a date range (e.g. 1 mei → 31 mei); the backend slices
    it into ISO weeks so the per-week planning/werkbon model stays untouched.
    """
    try:
        return await _create_planning_maand_bulk_impl(data, current_user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "[planning/maand-bulk] save failed | company=%s user=%s klant=%s werf=%s van=%s tot=%s err=%s",
            current_user.get("company_id"),
            current_user.get("user_id"),
            getattr(data, "klant_id", None),
            getattr(data, "werf_id", None),
            getattr(data, "van_datum", None),
            getattr(data, "tot_datum", None),
            exc,
        )
        raise HTTPException(status_code=500, detail=f"Maand-planning kon niet worden opgeslagen: {exc}")


async def _create_planning_maand_bulk_impl(data: PlanningMaandBulkCreate, current_user: Dict):
    from datetime import date as _date
    company_id = _require_tenant(current_user)

    # Parse + validate date range.
    try:
        van = _date.fromisoformat(data.van_datum)
        tot = _date.fromisoformat(data.tot_datum)
    except Exception:
        raise HTTPException(status_code=400, detail="Ongeldig datumformaat (verwacht YYYY-MM-DD)")
    if tot < van:
        raise HTTPException(status_code=400, detail="Tot-datum ligt vóór van-datum")
    if (tot - van).days > 366:
        raise HTTPException(status_code=400, detail="Periode is te lang (max 12 maanden)")

    weeks = _split_date_range_into_iso_weeks(van, tot, skip_weekend=data.skip_weekend)
    if not weeks:
        raise HTTPException(status_code=400, detail="Geen werkdagen in de geselecteerde periode")

    klant = await db.klanten.find_one({"id": data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": data.werf_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")

    werknemer_namen = list(data.werknemer_namen)
    if data.werknemer_ids and not werknemer_namen:
        for wid in data.werknemer_ids:
            user = await db.users.find_one({"id": wid, "company_id": company_id})
            if user:
                werknemer_namen.append(user["naam"])

    team_naam = None
    if data.team_id:
        team = await db.teams.find_one({"id": data.team_id, "company_id": company_id})
        if team:
            team_naam = team["naam"]

    # 1) Create the WerkbonGroep first so child werkbon stubs can carry its id.
    groep = WerkbonGroep(
        company_id=company_id,
        periode_van=data.van_datum,
        periode_tot=data.tot_datum,
        klant_id=data.klant_id,
        klant_naam=klant["naam"],
        werf_id=data.werf_id,
        werf_naam=werf["naam"],
        ingevuld_door_id=current_user["user_id"],
        ingevuld_door_naam=current_user.get("naam") or "",
    )
    groep_doc = groep.dict()
    await db.werkbon_groepen.insert_one(groep_doc)

    created_items: List[dict] = []
    werkbon_ids: List[str] = []
    waarschuwingen: List[str] = []

    # 2) For each ISO week, create per-day planning items AND a Werkbon stub
    #    that will later be filled with hours/signature. Werkbon carries
    #    groep_id so the verzenden endpoint can find all siblings.
    for wk in weeks:
        week_nummer = wk["week_nummer"]
        jaar = wk["jaar"]

        for dag in wk["dagen"]:
            for wid in data.werknemer_ids:
                existing = await db.planning.find_one({
                    "company_id": company_id,
                    "werknemer_ids": wid,
                    "week_nummer": week_nummer,
                    "jaar": jaar,
                    "dag": dag,
                })
                if existing:
                    user = await db.users.find_one({"id": wid, "company_id": company_id})
                    naam = user["naam"] if user else wid
                    waarschuwingen.append(f"{naam} is al ingepland op {dag} (wk {week_nummer})")

            item = PlanningItem(
                week_nummer=week_nummer,
                jaar=jaar,
                dag=dag,
                datum=wk["datums"].get(dag, ""),
                start_uur=data.start_uur or "",
                eind_uur=data.eind_uur or "",
                voorziene_uur=data.voorziene_uur or "",
                werknemer_ids=data.werknemer_ids,
                werknemer_namen=werknemer_namen,
                team_id=data.team_id,
                team_naam=team_naam,
                klant_id=data.klant_id,
                klant_naam=klant["naam"],
                werf_id=data.werf_id,
                werf_naam=werf["naam"],
                werf_adres=werf.get("adres", ""),
                omschrijving=data.omschrijving,
                materiaallijst=data.materiaallijst,
                nodige_materiaal=data.nodige_materiaal or "\n".join(data.materiaallijst),
                opmerking_aandachtspunt=data.opmerking_aandachtspunt or "",
                geschatte_duur=data.geschatte_duur or data.voorziene_uur or "",
                prioriteit=data.prioriteit,
                belangrijk=data.belangrijk,
                notities=data.notities,
            )
            item_doc = item.dict()
            item_doc["company_id"] = company_id
            await db.planning.insert_one(item_doc)
            created_items.append(serialize_mongo_doc(item_doc))

        # Create the Werkbon stub for this ISO week. ingevuld_door_* comes from
        # the admin who is planning — the worker will edit/sign later.
        week_dates = get_week_dates(jaar, week_nummer)
        werkbon = Werkbon(
            company_id=company_id,
            week_nummer=week_nummer,
            jaar=jaar,
            klant_id=data.klant_id,
            klant_naam=klant["naam"],
            werf_id=data.werf_id,
            werf_naam=werf["naam"],
            uren=[],
            km_afstand=KmRegel(),
            uitgevoerde_werken=data.omschrijving or "",
            extra_materialen=data.nodige_materiaal or "",
            ingevuld_door_id=current_user["user_id"],
            ingevuld_door_naam=current_user.get("naam") or "",
            toegewezen_aan=list(data.werknemer_ids),
            groep_id=groep.id,
            **week_dates,
        )
        wb_doc = werkbon.dict()
        wb_doc["company_id"] = company_id
        await db.werkbonnen.insert_one(wb_doc)
        werkbon_ids.append(werkbon.id)

    # Persist the resolved werkbon list back on the groep.
    await db.werkbon_groepen.update_one(
        {"id": groep.id},
        {"$set": {"werkbon_ids": werkbon_ids, "updated_at": datetime.now(timezone.utc)}}
    )

    # Single push covering the entire range — workers don't need a notification
    # per ISO week.
    if data.werknemer_ids and created_items:
        try:
            periode_str = f"{data.van_datum} t/m {data.tot_datum}"
            await send_push_notifications(
                data.werknemer_ids,
                "Nieuwe maand-planning",
                f"U bent ingepland bij {klant['naam']} - {werf['naam']} ({periode_str})",
                {"type": "planning", "groep_id": groep.id},
            )
        except Exception as e:
            logging.error(f"Push notification failed: {e}")

    result: Dict[str, Any] = {
        "groep_id": groep.id,
        "werkbon_ids": werkbon_ids,
        "weken": [{"week_nummer": w["week_nummer"], "jaar": w["jaar"], "aantal_dagen": len(w["dagen"])} for w in weeks],
        "items": created_items,
        "count": len(created_items),
    }
    if waarschuwingen:
        result["waarschuwingen"] = waarschuwingen
    return result


@api_router.post("/planning")
async def create_planning(data: PlanningItemCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create planning item - Admin/Master Admin only"""
    try:
        return await _create_planning_impl(data, current_user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "[planning] save failed | company=%s user=%s klant=%s werf=%s dag=%s err=%s",
            current_user.get("company_id"),
            current_user.get("user_id"),
            getattr(data, "klant_id", None),
            getattr(data, "werf_id", None),
            getattr(data, "dag", None),
            exc,
        )
        raise HTTPException(status_code=500, detail=f"Planning kon niet worden opgeslagen: {exc}")


async def _create_planning_impl(data: PlanningItemCreate, current_user: Dict):
    company_id = _require_tenant(current_user)
    # Resolve names (tenant-scoped)
    klant = await db.klanten.find_one({"id": data.klant_id, "company_id": company_id})
    werf = await db.werven.find_one({"id": data.werf_id, "company_id": company_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")

    # Get worker names if not provided (tenant-scoped)
    werknemer_namen = data.werknemer_namen
    if data.werknemer_ids and not werknemer_namen:
        for wid in data.werknemer_ids:
            user = await db.users.find_one({"id": wid, "company_id": company_id})
            if user:
                werknemer_namen.append(user["naam"])

    team_naam = None
    if data.team_id:
        team = await db.teams.find_one({"id": data.team_id, "company_id": company_id})
        if team:
            team_naam = team["naam"]

    # Check if worker is already assigned (orange warning)
    waarschuwingen = []
    for wid in data.werknemer_ids:
        existing = await db.planning.find_one({
            "company_id": company_id,
            "werknemer_ids": wid,
            "week_nummer": data.week_nummer,
            "jaar": data.jaar,
            "dag": data.dag,
        })
        if existing:
            user = await db.users.find_one({"id": wid, "company_id": company_id})
            naam = user["naam"] if user else wid
            waarschuwingen.append(f"{naam} is al ingepland op {data.dag}")
    
    item = PlanningItem(
        week_nummer=data.week_nummer,
        jaar=data.jaar,
        dag=data.dag,
        datum=data.datum,
        start_uur=data.start_uur or "",
        eind_uur=data.eind_uur or "",
        voorziene_uur=data.voorziene_uur or "",
        werknemer_ids=data.werknemer_ids,
        werknemer_namen=werknemer_namen,
        team_id=data.team_id,
        team_naam=team_naam,
        klant_id=data.klant_id,
        klant_naam=klant["naam"],
        werf_id=data.werf_id,
        werf_naam=werf["naam"],
        werf_adres=werf.get("adres", ""),
        omschrijving=data.omschrijving,
        materiaallijst=data.materiaallijst,
        nodige_materiaal=data.nodige_materiaal or "\n".join(data.materiaallijst),
        opmerking_aandachtspunt=data.opmerking_aandachtspunt or "",
        geschatte_duur=data.geschatte_duur or data.voorziene_uur or "",
        prioriteit=data.prioriteit,
        belangrijk=data.belangrijk,
        notities=data.notities,
    )
    item_doc = item.dict()
    item_doc["company_id"] = _require_tenant(current_user)
    await db.planning.insert_one(item_doc)
    # pymongo mutates item_doc in place to add _id (ObjectId) — strip the
    # Mongo-only fields before returning so FastAPI can serialize the body.
    result = serialize_mongo_doc(item_doc)
    if waarschuwingen:
        result["waarschuwingen"] = waarschuwingen

    # Send push notifications to assigned workers
    if data.werknemer_ids:
        try:
            await send_push_notifications(
                data.werknemer_ids,
                "Nieuwe planning",
                f"U bent ingepland bij {klant['naam']} - {werf['naam']} op {data.dag}",
                {"type": "planning", "planning_id": item.id}
            )
        except Exception as e:
            logging.error(f"Push notification failed: {e}")

    return result

@api_router.put("/planning/{planning_id}")
async def update_planning(planning_id: str, update_data: PlanningItemUpdate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update planning item - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)

    # Resolve names if IDs changed (tenant-scoped)
    if update_data.klant_id:
        klant = await db.klanten.find_one({"id": update_data.klant_id, "company_id": company_id})
        if klant:
            update_dict["klant_naam"] = klant["naam"]
    if update_data.werf_id:
        werf = await db.werven.find_one({"id": update_data.werf_id, "company_id": company_id})
        if werf:
            update_dict["werf_naam"] = werf["naam"]
            update_dict["werf_adres"] = werf.get("adres", "")
    if update_data.werknemer_ids:
        namen = []
        for wid in update_data.werknemer_ids:
            user = await db.users.find_one({"id": wid, "company_id": company_id})
            if user:
                namen.append(user["naam"])
        update_dict["werknemer_namen"] = namen

    result = await db.planning.update_one({"id": planning_id, "company_id": company_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")
    updated = await db.planning.find_one({"id": planning_id, "company_id": company_id}, {"_id": 0})
    return updated

@api_router.delete("/planning/{planning_id}")
async def delete_planning(planning_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete planning item - Admin/Master Admin only"""
    company_id = _require_tenant(current_user)
    result = await db.planning.delete_one({"id": planning_id, "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")
    return {"message": "Planning item verwijderd"}

@api_router.post("/planning/{planning_id}/bevestig")
async def bevestig_planning(planning_id: str, werknemer_id: str, werknemer_naam: Optional[str] = Query(None), current_user: Dict = Depends(get_current_user)):
    """Worker confirms/acknowledges a planning item"""
    company_id = _require_tenant(current_user)
    item = await db.planning.find_one({"id": planning_id, "company_id": company_id})
    if not item:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")

    bevestigd = item.get("bevestigd_door", [])
    bevestigingen = item.get("bevestigingen", [])
    timestamp_now = datetime.now(timezone.utc).isoformat()

    if werknemer_id not in bevestigd:
        bevestigd.append(werknemer_id)
        # Store detailed confirmation with timestamp
        bevestigingen = [b for b in bevestigingen if b.get("worker_id") != werknemer_id]
        bevestigingen.append({
            "worker_id": werknemer_id,
            "worker_naam": werknemer_naam or werknemer_id,
            "timestamp": timestamp_now,
        })
        await db.planning.update_one(
            {"id": planning_id, "company_id": company_id},
            {"$set": {"bevestigd_door": bevestigd, "bevestigingen": bevestigingen}}
        )

        # Send notification ONLY to company admins/master_admins.
        # Explicitly exclude the confirming werknemer (in case their account
        # also carries an admin role) so the worker never gets their own push.
        try:
            admin_ids: List[str] = []
            async for admin in db.users.find(
                {
                    "company_id": company_id,
                    "rol": {"$in": ["admin", "master_admin"]},
                    "actief": True,
                    "id": {"$ne": werknemer_id},
                },
                {"id": 1},
            ):
                admin_ids.append(admin["id"])

            if admin_ids:
                werf_naam = item.get("werf_naam", "onbekend")
                dag = item.get("dag", "")
                await send_push_notifications(
                    admin_ids,
                    "📋 Planning bevestigd",
                    f"{werknemer_naam or 'Werknemer'} heeft de opdracht bevestigd ({werf_naam} - {dag})",
                    {"type": "planning_bevestigd", "planning_id": planning_id}
                )
        except Exception as e:
            logging.error(f"Error sending bevestig notification: {e}")
            
    return {"message": "Planning bevestigd", "bevestigd_door": bevestigd, "bevestigingen": bevestigingen}

# ==================== BERICHTEN (MESSAGES) ROUTES ====================

@api_router.get("/berichten")
async def get_berichten(user_id: str, current_user: Dict = Depends(get_current_user)):
    """Get messages for a user (broadcasts + direct messages). Excludes messages hidden by this user."""
    company_id = _require_tenant(current_user)
    _sub_b, plan_b, _co_b = await _resolve_company_plan(company_id)
    _require_feature(plan_b, "berichten", "Berichten")
    base = {
        "$or": [{"naar_id": user_id}, {"is_broadcast": True}, {"van_id": user_id}],
        "hidden_for_users": {"$nin": [user_id]},
    }
    # Add company filter via $and to preserve $or
    q = {"$and": [base, _company_scope_query(company_id)]}
    items = await db.berichten.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/berichten/ongelezen")
async def get_ongelezen_berichten(user_id: str, current_user: Dict = Depends(get_current_user)):
    """Get unread message count for a user (tenant-scoped)"""
    company_id = _require_tenant(current_user)
    count = await db.berichten.count_documents({
        "company_id": company_id,
        "$or": [{"naar_id": user_id}, {"is_broadcast": True}],
        "gelezen_door": {"$nin": [user_id]}
    })
    return {"ongelezen": count}

@api_router.post("/berichten")
async def create_bericht(data: BerichtCreate, current_user: Dict = Depends(get_current_user)):
    """Create bericht - uses authenticated user's identity from JWT"""
    company_id_b = _require_tenant(current_user)
    _sub_b2, plan_b2, _co_b2 = await _resolve_company_plan(company_id_b)
    _require_feature(plan_b2, "berichten", "Berichten")
    # Use authenticated user's identity from JWT (NOT from request parameters)
    van_id = current_user["user_id"]
    van_naam = current_user["naam"]
    
    # Process bijlagen (attachments) - store in GridFS
    processed_bijlagen = []
    for att in (data.bijlagen or []):
        try:
            att_dict = att.dict() if hasattr(att, 'dict') else att
            if att_dict.get("data") and len(att_dict.get("data", "")) > 100:
                # Store file in GridFS
                file_id = await store_base64_to_gridfs(
                    att_dict["data"],
                    att_dict.get("naam", f"bijlage_{uuid.uuid4().hex[:8]}"),
                    att_dict.get("type", "application/octet-stream")
                )
                processed_bijlagen.append({
                    "naam": att_dict.get("naam", ""),
                    "type": att_dict.get("type", "application/octet-stream"),
                    "file_id": file_id,  # Store GridFS file_id instead of data
                })
            else:
                # Keep small attachments as-is
                processed_bijlagen.append(att_dict)
        except Exception as e:
            logging.error(f"Failed to store attachment to GridFS: {e}")
    
    bericht_dict = {
        "id": str(uuid.uuid4()),
        "company_id": company_id_b,
        "van_id": van_id,
        "van_naam": van_naam,
        "naar_id": data.naar_id,
        "naar_naam": None,
        "is_broadcast": data.is_broadcast,
        "onderwerp": data.onderwerp,
        "inhoud": data.inhoud,
        "vastgepind": data.vastgepind,
        "gelezen_door": [],
        "bijlagen": processed_bijlagen,
        "planning_id": data.planning_id,
        "created_at": datetime.now(timezone.utc),
    }
    
    # Resolve recipient name (tenant-scoped)
    if data.naar_id:
        user = await db.users.find_one({"id": data.naar_id, "company_id": bericht_dict["company_id"]})
        if user:
            bericht_dict["naar_naam"] = user["naam"]
    
    await db.berichten.insert_one(bericht_dict)

    # Auto-save bijlagen to werknemer_documenten when sent to a specific worker
    if data.naar_id and processed_bijlagen:
        try:
            for att in processed_bijlagen:
                if att.get("file_id"):
                    doc = {
                        "id": str(uuid.uuid4()),
                        "werknemer_id": data.naar_id,
                        "naam": att.get("naam", "bijlage"),
                        "beschrijving": f"Bijlage van bericht: {data.onderwerp or ''}",
                        "file_id": att["file_id"],
                        "bestandsnaam": att.get("naam", "bijlage"),
                        "type": att.get("type", "application/octet-stream"),
                        "grootte": 0,
                        "uploaded_by_id": van_id,
                        "uploaded_by_naam": van_naam,
                        "created_at": datetime.now(timezone.utc),
                    }
                    await db.werknemer_documenten.insert_one(doc)
        except Exception as e:
            logging.error(f"Failed to auto-save bericht attachment to documenten: {e}")

    # Send push notification to recipients
    try:
        notification_recipients = []
        if data.is_broadcast:
            # For broadcasts, send only to active workers in same tenant
            async for user in db.users.find(
                {"company_id": bericht_dict["company_id"], "actief": True, "push_token": {"$ne": None}},
                {"id": 1}
            ):
                if user["id"] != van_id:  # Don't notify sender
                    notification_recipients.append(user["id"])
        elif data.naar_id:
            notification_recipients = [data.naar_id]
        
        if notification_recipients:
            await send_push_notifications(
                notification_recipients,
                data.onderwerp or "Nieuw bericht",
                f"Van {van_naam}: {data.inhoud[:100]}..." if len(data.inhoud) > 100 else f"Van {van_naam}: {data.inhoud}",
                {"type": "bericht", "bericht_id": bericht_dict["id"]}
            )
    except Exception as e:
        logging.error(f"Push notification failed for bericht: {e}")
    
    return serialize_mongo_doc(bericht_dict)

@api_router.post("/berichten/{bericht_id}/gelezen")
async def markeer_gelezen(bericht_id: str, user_id: str, current_user: Dict = Depends(get_current_user)):
    """Mark a message as read (tenant-scoped)"""
    company_id = _require_tenant(current_user)
    await db.berichten.update_one(
        {"id": bericht_id, "company_id": company_id},
        {"$addToSet": {"gelezen_door": user_id}}
    )
    return {"message": "Bericht als gelezen gemarkeerd"}

@api_router.delete("/berichten/{bericht_id}/hide-for-user")
async def hide_bericht_for_user(bericht_id: str, current_user: Dict = Depends(get_current_user)):
    """Hide a bericht for the current user only. Does NOT delete from database."""
    current_user_id = current_user["user_id"]
    await db.berichten.update_one(
        {"id": bericht_id},
        {"$addToSet": {"hidden_for_users": current_user_id}}
    )
    return {"success": True}

@api_router.delete("/berichten/{bericht_id}")
async def delete_bericht(bericht_id: str, current_user: Dict = Depends(get_current_user)):
    company_id = _require_tenant(current_user)
    result = await db.berichten.delete_one({"id": bericht_id, "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bericht niet gevonden")
    return {"message": "Bericht verwijderd"}

@api_router.patch("/berichten/{bericht_id}")
async def update_bericht(bericht_id: str, data: dict, current_user: Dict = Depends(get_current_user)):
    """Update a bericht (archive, pin, etc.) - tenant-scoped"""
    company_id = _require_tenant(current_user)
    update_fields = {}
    if "gearchiveerd" in data:
        update_fields["gearchiveerd"] = data["gearchiveerd"]
    if "vastgepind" in data:
        update_fields["vastgepind"] = data["vastgepind"]

    if not update_fields:
        raise HTTPException(status_code=400, detail="Geen velden om bij te werken")

    result = await db.berichten.update_one(
        {"id": bericht_id, "company_id": company_id},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bericht niet gevonden")
    return {"message": "Bericht bijgewerkt", "updated_fields": list(update_fields.keys())}

@api_router.post("/berichten/send-email")
async def send_bericht_email(data: dict, current_user: Dict = Depends(get_current_user)):
    """Send a bericht also via email. Tenant-scoped: instellingen come from the
    sender's own tenant, so every mail is branded with the sender's logo and
    bedrijfsnaam — never a sibling tenant's brand."""
    try:
        company_id = _require_tenant(current_user)
        to_email = data.get("to_email")
        onderwerp = data.get("onderwerp", "Nieuw bericht")
        inhoud = data.get("inhoud", "")
        van_naam = data.get("van_naam", "Admin")

        if not to_email:
            return {"success": False, "error": "Geen e-mailadres"}

        instellingen = await get_instellingen_for_company(company_id)
        bedrijfsnaam = instellingen.get("bedrijfsnaam", "Signybon")
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #1a1a2e; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: #F5A623; margin: 0; font-size: 22px;">{bedrijfsnaam}</h1>
            </div>
            <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e8e9ed;">
                <p style="color: #6c757d; font-size: 13px; margin: 0 0 8px 0;">Bericht van {van_naam}</p>
                <h2 style="color: #1a1a2e; margin: 0 0 16px 0; font-size: 18px;">{onderwerp}</h2>
                <div style="color: #333; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{inhoud}</div>
            </div>
            <div style="background-color: #f5f6fa; padding: 16px; border-radius: 0 0 10px 10px; text-align: center; border: 1px solid #e8e9ed; border-top: 0;">
                <p style="color: #999; font-size: 11px; margin: 0;">Dit bericht is verzonden via {bedrijfsnaam} App</p>
            </div>
        </div>
        """
        
        resend_key = os.getenv("RESEND_API_KEY")
        sender_email = os.getenv("SENDER_EMAIL", "noreply@signybon.com")
        
        if not resend_key:
            return {"success": False, "error": "E-mail service niet geconfigureerd"}
        
        import resend
        resend.api_key = resend_key
        
        result = resend.Emails.send({
            "from": f"{bedrijfsnaam} <{sender_email}>",
            "to": [to_email],
            "subject": f"{bedrijfsnaam} - {onderwerp}",
            "html": html_content,
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
        })
        
        return {"success": True, "id": str(result)}
    except Exception as e:
        logging.error(f"Bericht email error: {e}")
        return {"success": False, "error": str(e)}

# ==================== FILE STORAGE / GRIDFS ROUTES ====================

@api_router.get("/files/{file_id}")
async def get_file(file_id: str):
    """Serve a file from GridFS by file_id"""
    try:
        grid_out = await gridfs_bucket.open_download_stream(ObjectId(file_id))
        data = await grid_out.read()
        content_type = grid_out.metadata.get("content_type", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
        filename = grid_out.filename or "file"
        
        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "public, max-age=31536000"  # Cache for 1 year
            }
        )
    except Exception as e:
        logging.error(f"Failed to retrieve file {file_id}: {e}")
        raise HTTPException(status_code=404, detail="Bestand niet gevonden")

@api_router.get("/files/{file_id}/base64")
async def get_file_base64(file_id: str):
    """Get file from GridFS as base64 string"""
    try:
        grid_out = await gridfs_bucket.open_download_stream(ObjectId(file_id))
        data = await grid_out.read()
        content_type = grid_out.metadata.get("content_type", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
        base64_data = base64.b64encode(data).decode('utf-8')
        
        return {
            "data": base64_data,
            "content_type": content_type,
            "filename": grid_out.filename
        }
    except Exception as e:
        logging.error(f"Failed to retrieve file {file_id}: {e}")
        raise HTTPException(status_code=404, detail="Bestand niet gevonden")

@api_router.post("/files/upload")
async def upload_file(data: dict):
    """Upload a file (base64) to GridFS and return file_id"""
    try:
        base64_data = data.get("data")
        filename = data.get("filename", f"file_{uuid.uuid4().hex[:8]}")
        content_type = data.get("content_type", "application/octet-stream")
        
        if not base64_data:
            raise HTTPException(status_code=400, detail="Geen data ontvangen")
        
        file_id = await store_base64_to_gridfs(base64_data, filename, content_type)
        return {"file_id": file_id, "filename": filename}
    except Exception as e:
        logging.error(f"Failed to upload file: {e}")
        raise HTTPException(status_code=500, detail="Upload mislukt. Probeer het opnieuw.")

@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """Delete a file from GridFS"""
    success = await delete_file_from_gridfs(file_id)
    if success:
        return {"message": "Bestand verwijderd"}
    raise HTTPException(status_code=404, detail="Bestand niet gevonden")

# ==================== WERKNEMER DOCUMENTEN (Personal Documents per Worker) ====================

class WerknemerDocument(BaseModel):
    """Document model for personal documents per worker"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    werknemer_id: str  # The worker this document belongs to
    naam: str  # Document name/title
    beschrijving: str = ""  # Optional description
    file_id: str  # GridFS file ID
    bestandsnaam: str  # Original filename
    type: str  # MIME type (application/pdf, image/png, etc.)
    grootte: int = 0  # File size in bytes
    uploaded_by_id: str  # Admin who uploaded
    uploaded_by_naam: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WerknemerDocumentCreate(BaseModel):
    werknemer_id: str
    naam: str
    beschrijving: str = ""
    bestandsnaam: str
    type: str
    data: str  # Base64 encoded file data

@api_router.get("/werknemer-documenten/{werknemer_id}")
async def get_werknemer_documenten(werknemer_id: str, current_user: Dict = Depends(get_current_user)):
    """Get all documents for a specific worker - with auth check"""
    # Security: Admin/planner can see any worker's documents
    # Workers can only see their own documents
    is_admin = current_user["role"] in ["master_admin", "admin", "planner"]
    is_own_docs = current_user["user_id"] == werknemer_id
    
    if not is_admin and not is_own_docs:
        raise HTTPException(status_code=403, detail="Geen toegang tot documenten van andere werknemers")
    
    docs = await db.werknemer_documenten.find(
        {"werknemer_id": werknemer_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return docs

@api_router.get("/werknemer-documenten/{werknemer_id}/{doc_id}")
async def get_werknemer_document(werknemer_id: str, doc_id: str):
    """Get a specific document"""
    doc = await db.werknemer_documenten.find_one(
        {"id": doc_id, "werknemer_id": werknemer_id},
        {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document niet gevonden")
    return doc

@api_router.post("/werknemer-documenten")
async def create_werknemer_document(data: WerknemerDocumentCreate, current_user: Dict = Depends(get_current_user)):
    """Upload a new document for a worker (admin only)"""
    # Only admins can upload
    if current_user["role"] not in ["master_admin", "admin", "planner"]:
        raise HTTPException(status_code=403, detail="Geen toegang om documenten te uploaden")
    
    # Check if worker exists
    worker = await db.users.find_one({"id": data.werknemer_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Werknemer niet gevonden")
    
    # Store file in GridFS
    try:
        file_id = await store_base64_to_gridfs(
            data.data,
            data.bestandsnaam,
            data.type
        )
    except Exception as e:
        logging.error(f"Failed to store document in GridFS: {e}")
        raise HTTPException(status_code=500, detail="Kon bestand niet opslaan")
    
    # Calculate approximate file size from base64
    base64_data = data.data.split(",")[1] if "," in data.data else data.data
    file_size = int(len(base64_data) * 3 / 4)
    
    # Create document record
    doc = {
        "id": str(uuid.uuid4()),
        "werknemer_id": data.werknemer_id,
        "naam": data.naam or data.bestandsnaam,
        "beschrijving": data.beschrijving,
        "file_id": file_id,
        "bestandsnaam": data.bestandsnaam,
        "type": data.type,
        "grootte": file_size,
        "uploaded_by_id": current_user["user_id"],
        "uploaded_by_naam": current_user["naam"],
        "created_at": datetime.now(timezone.utc),
    }
    
    await db.werknemer_documenten.insert_one(doc)
    
    # Return without _id
    doc.pop("_id", None)
    return doc

@api_router.delete("/werknemer-documenten/{werknemer_id}/{doc_id}")
async def delete_werknemer_document(werknemer_id: str, doc_id: str, current_user: Dict = Depends(get_current_user)):
    """Delete a document (admin only)"""
    # Only admins can delete
    if current_user["role"] not in ["master_admin", "admin", "planner"]:
        raise HTTPException(status_code=403, detail="Geen toegang om documenten te verwijderen")
    
    # Find document
    doc = await db.werknemer_documenten.find_one({"id": doc_id, "werknemer_id": werknemer_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document niet gevonden")
    
    # Delete file from GridFS
    if doc.get("file_id"):
        await delete_file_from_gridfs(doc["file_id"])
    
    # Delete record
    await db.werknemer_documenten.delete_one({"id": doc_id})
    
    return {"message": "Document verwijderd"}

@api_router.get("/mijn-documenten")
async def get_mijn_documenten(current_user: Dict = Depends(get_current_user)):
    """Get documents for the currently logged-in worker (for mobile app)"""
    docs = await db.werknemer_documenten.find(
        {"werknemer_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return docs

# ==================== THEME / APP SETTINGS ROUTE ====================

async def _build_app_settings_response(settings: dict) -> dict:
    """Shared logic for /app-settings — lightweight, no logo_base64. Fallback
    colors are the Signybon brand palette so a tenant who hasn't picked colors
    yet never inherits another tenant's look."""
    return {
        "bedrijfsnaam": settings.get("bedrijfsnaam", "Signybon"),
        "primary_color": settings.get("primary_color", "#1B4332"),
        "secondary_color": settings.get("secondary_color", "#D4A017"),
        "accent_color": settings.get("accent_color", "#1B4332"),
        "pdf_voettekst": settings.get("pdf_voettekst"),
        "uren_confirmation_text": settings.get("uren_confirmation_text"),
        "oplevering_confirmation_text": settings.get("oplevering_confirmation_text"),
        "project_confirmation_text": settings.get("project_confirmation_text"),
    }

SIGNYBON_DEFAULT_SETTINGS = {
    "bedrijfsnaam": "Signybon",
    "primary_color": "#1B4332",
    "secondary_color": "#D4A017",
    "accent_color": "#1B4332",
    "pdf_voettekst": None,
    "uren_confirmation_text": None,
    "oplevering_confirmation_text": None,
    "project_confirmation_text": None,
}

SIGNYBON_DEFAULT_LOGO = {
    "logo_base64": None,
    "bedrijfsnaam": "Signybon",
}


def _extract_company_id_from_token(authorization: Optional[str]) -> Optional[str]:
    """Try to extract company_id from Authorization header. Returns None if no valid token."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    payload = decode_jwt_token(token)
    if not payload:
        return None
    return payload.get("company_id")


@api_router.get("/app-settings")
async def get_app_settings(authorization: Optional[str] = Header(None)):
    """Get app theme settings. With valid token → tenant settings. Without → Signybon defaults."""
    company_id = _extract_company_id_from_token(authorization)
    if not company_id:
        return SIGNYBON_DEFAULT_SETTINGS

    cache_key = f"app-settings:{company_id}"
    cached = get_cache(cache_key, ttl_seconds=300)
    if cached is not None:
        return cached
    settings = await get_instellingen_for_company(company_id)
    result = await _build_app_settings_response(settings)
    set_cache(cache_key, result)
    return result

@api_router.get("/app-settings/logo")
async def get_app_settings_logo(authorization: Optional[str] = Header(None)):
    """Logo endpoint. With valid token → tenant logo. Without → Signybon defaults (no logo)."""
    company_id = _extract_company_id_from_token(authorization)
    if not company_id:
        return SIGNYBON_DEFAULT_LOGO

    cache_key = f"app-settings:logo:{company_id}"
    cached = get_cache(cache_key, ttl_seconds=600)
    if cached is not None:
        return cached
    settings = await get_instellingen_for_company(company_id)
    branding = settings.get("branding") or {}
    logo_b64 = branding.get("logo_base64") or settings.get("logo_base64")
    result = {"logo_base64": logo_b64, "bedrijfsnaam": settings.get("bedrijfsnaam", "Signybon")}
    set_cache(cache_key, result)
    return result

@api_router.get("/public/branding")
async def get_public_branding():
    """Public endpoint — returns the Signybon platform branding for unauth pages
    (login, register). We DELIBERATELY do not look up any tenant's settings
    here: an unauth caller cannot identify their tenant, so returning the first
    tenant document MongoDB happens to find would leak that tenant's logo &
    colors to every other visitor. Tenant-specific branding is served from
    /api/app-settings only after login (where the JWT identifies the tenant)."""
    return {
        **SIGNYBON_DEFAULT_SETTINGS,
        "logo_base64": SIGNYBON_DEFAULT_LOGO.get("logo_base64"),
    }

# ==================== DASHBOARD STATS ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: Dict = Depends(get_current_user)):
    """Get comprehensive dashboard statistics"""
    company_id = current_user.get("company_id")
    now = datetime.now(timezone.utc)
    iso = now.isocalendar()
    current_week = iso[1]
    iso_year = iso[0]
    cal_year = now.year
    # Werkbonnen store `jaar` as calendar year from clients; ISO week-year can differ at year boundaries
    jaar_match = list({iso_year, cal_year})

    # All queries scoped to tenant via company_id
    total_werknemers = await db.users.count_documents(_company_scope_query(company_id, {"actief": True, "rol": {"$in": ["worker", "onderaannemer"]}}))
    total_teams = await db.teams.count_documents(_company_scope_query(company_id))
    total_klanten = await db.klanten.count_documents(_company_scope_query(company_id))
    total_werven = await db.werven.count_documents(_company_scope_query(company_id))

    # Werkbonnen stats
    werkbonnen_week = await db.werkbonnen.count_documents(_company_scope_query(company_id, {"week_nummer": current_week, "jaar": {"$in": jaar_match}}))
    werkbonnen_ondertekend = await db.werkbonnen.count_documents(_company_scope_query(company_id, {"status": "ondertekend"}))
    werkbonnen_concept = await db.werkbonnen.count_documents(_company_scope_query(company_id, {"status": "concept"}))

    # Oplevering stats
    oplevering_total = await db.oplevering_werkbonnen.count_documents(_company_scope_query(company_id))

    # Project werkbon stats
    project_total = await db.project_werkbonnen.count_documents(_company_scope_query(company_id))

    # Planning stats
    planning_week = await db.planning.count_documents(_company_scope_query(company_id, {"week_nummer": current_week, "jaar": {"$in": jaar_match}}))
    planning_afgerond = await db.planning.count_documents(_company_scope_query(company_id, {"week_nummer": current_week, "jaar": {"$in": jaar_match}, "status": "afgerond"}))

    # Unread messages
    ongelezen_berichten = await db.berichten.count_documents(_company_scope_query(company_id, {"gelezen_door": {"$size": 0}}))
    
    return {
        "werknemers": total_werknemers,
        "teams": total_teams,
        "klanten": total_klanten,
        "werven": total_werven,
        "werkbonnen_deze_week": werkbonnen_week,
        "werkbonnen_ondertekend": werkbonnen_ondertekend,
        "werkbonnen_concept": werkbonnen_concept,
        "oplevering_werkbonnen": oplevering_total,
        "project_werkbonnen": project_total,
        "planning_deze_week": planning_week,
        "planning_afgerond": planning_afgerond,
        "ongelezen_berichten": ongelezen_berichten,
        "week_nummer": current_week,
        "jaar": cal_year,
        "jaar_iso": iso_year,
    }

@api_router.get("/dashboard/recent-werkbonnen")
async def get_recent_werkbonnen(
    limit: int = Query(20, le=50),
    current_user: Dict = Depends(require_web_access()),
):
    """Lightweight endpoint for dashboard — returns only metadata fields, no heavy blobs."""
    projection = {
        "_id": 0,
        "id": 1,
        "klant_naam": 1,
        "werf_naam": 1,
        "week_nummer": 1,
        "jaar": 1,
        "status": 1,
        "created_at": 1,
        "ingevuld_door_naam": 1,
    }
    company_id = current_user.get("company_id")
    cursor = db.werkbonnen.find(_company_scope_query(company_id), projection).sort("created_at", -1).limit(limit)
    try:
        werkbonnen = await asyncio.wait_for(cursor.to_list(limit), timeout=5.0)
    except asyncio.TimeoutError:
        logging.warning("[recent-werkbonnen] Query timed out")
        return []
    return werkbonnen

def _sum_uren_from_werkbonnen_docs(werkbonnen: List[Dict]) -> float:
    totaal = 0.0
    for wb in werkbonnen:
        for uren_regel in wb.get("uren", []) or []:
            for dag in ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]:
                val = uren_regel.get(dag, 0)
                try:
                    totaal += float(val)
                except (ValueError, TypeError):
                    pass
    return totaal


@api_router.get("/dashboard/uren-week")
async def get_uren_deze_week(
    week_nummer: int,
    jaar: int,
    current_user: Dict = Depends(get_current_user),
):
    """Total uren for all werkbonnen in the given ISO week (jaar aligns with stats + dashboard week boundaries)."""
    now = datetime.now(timezone.utc)
    iso_y = now.isocalendar()[0]
    cal_y = now.year
    jaar_opts = list({jaar, iso_y, cal_y})
    werkbonnen = await db.werkbonnen.find(
        {"week_nummer": week_nummer, "jaar": {"$in": jaar_opts}},
        {"_id": 0, "uren": 1},
    ).to_list(2000)
    totaal = _sum_uren_from_werkbonnen_docs(werkbonnen)
    return {"totaal_uren": round(totaal, 1), "week_nummer": week_nummer, "jaar": jaar}


@api_router.get("/dashboard/uren-maand")
async def get_uren_deze_maand(jaar: int, maand: int, current_user: Dict = Depends(get_current_user)):
    """Get total uren and werkbon count for a given month across all werkbonnen."""
    import calendar
    weeks_set = set()
    _, num_days = calendar.monthrange(jaar, maand)
    for day in range(1, num_days + 1):
        d = datetime(jaar, maand, day)
        weeks_set.add(d.isocalendar()[1])
    query = {"jaar": jaar, "week_nummer": {"$in": list(weeks_set)}}
    werkbonnen_aantal = await db.werkbonnen.count_documents(query)
    werkbonnen = await db.werkbonnen.find(query, {"_id": 0, "uren": 1}).to_list(5000)
    totaal = _sum_uren_from_werkbonnen_docs(werkbonnen)
    return {
        "totaal_uren": round(totaal, 1),
        "werkbonnen_aantal": werkbonnen_aantal,
        "jaar": jaar,
        "maand": maand,
    }

@api_router.get("/")
async def root():
    return {"message": "Werkbon API is actief", "version": "2.0.0"}

@api_router.get("/health")
async def api_health_check():
    return {"status": "healthy", "database": "connected"}

# ==================== HELP / SUPPORT ====================

class HelpAIRequest(BaseModel):
    messages: List[Dict[str, str]]

class HelpTicketRequest(BaseModel):
    naam: str
    email: str
    bedrijfsnaam: Optional[str] = ""
    vraag: str

SIGNYBON_AI_SYSTEM_PROMPT = (
    "Je bent de Signybon support assistent. Je kent het hele Signybon platform van A tot Z: "
    "werkbonnen (uren, dag, oplevering, prestatie), planning, PDF generatie, facturatie koppeling (Billit), "
    "instellingen, gebruikers, klanten, werven, mobiele app en web admin panel. "
    "Antwoord altijd in de taal van de gebruiker (NL/FR/EN/TR). Wees beknopt en behulpzaam. "
    "Als je iets niet zeker weet of de gebruiker meer hulp nodig heeft, raad aan om via Contact tab "
    "een ticket aan te maken naar info@signybon.com."
)

@api_router.post("/help/ai-chat")
@limiter.limit("20/minute")
async def help_ai_chat(request: Request, data: HelpAIRequest):
    """Tier 2: AI assistant via Anthropic API."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"reply": "AI assistent is niet geconfigureerd. Stuur a.u.b. een ticket via de Contact tab."}
    try:
        import httpx
        # Build conversation history
        anthropic_messages = []
        for m in data.messages[-10:]:  # last 10 messages
            role = m.get("role")
            content = (m.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                anthropic_messages.append({"role": role, "content": content})
        if not anthropic_messages:
            return {"reply": "Stel a.u.b. een vraag."}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1024,
                    "system": SIGNYBON_AI_SYSTEM_PROMPT,
                    "messages": anthropic_messages,
                },
            )
            if resp.status_code != 200:
                logging.error(f"Anthropic API error: {resp.status_code} {resp.text}")
                return {"reply": "Sorry, er ging iets mis. Probeer Contact tab voor een ticket."}
            result = resp.json()
            reply_text = ""
            for block in result.get("content", []):
                if block.get("type") == "text":
                    reply_text += block.get("text", "")
            return {"reply": reply_text or "Geen antwoord ontvangen."}
    except Exception as e:
        logging.error(f"AI chat error: {e}")
        return {"reply": "Verbinding mislukt. Probeer Contact tab voor een ticket."}

@api_router.post("/help/ticket")
@limiter.limit("5/minute")
async def help_ticket(request: Request, data: HelpTicketRequest):
    """Tier 3: Persist support ticket and email it to info@signybon.com."""
    # Persist regardless of email status so the master panel can pick it up.
    ticket_doc = {
        "id": str(uuid.uuid4()),
        "company_id": None,
        "bedrijfsnaam": data.bedrijfsnaam or "",
        "naam": data.naam,
        "email": data.email,
        "vraag": data.vraag,
        "status": "open",
        "replies": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        # Best-effort link to a tenant via email match
        owner = await db.users.find_one(
            {"email": data.email.lower().strip()}, {"_id": 0, "company_id": 1}
        )
        if owner and owner.get("company_id"):
            ticket_doc["company_id"] = owner["company_id"]
        await db.support_tickets.insert_one(ticket_doc.copy())
    except Exception as exc:
        logging.warning("[help/ticket] persist failed: %s", exc)

    if not resend.api_key:
        # Persisted but cannot email — still report success so the user knows
        # the ticket reached the panel.
        return {"success": True, "message": "Ticket geregistreerd (e-mail uitgeschakeld)"}
    try:
        html = f"""
        <h2>Nieuw support ticket — Signybon</h2>
        <p><b>Naam:</b> {data.naam}</p>
        <p><b>E-mail:</b> {data.email}</p>
        <p><b>Bedrijfsnaam:</b> {data.bedrijfsnaam or '-'}</p>
        <p><b>Vraag:</b></p>
        <div style="background:#f8f9fa;padding:14px;border-radius:8px;border-left:4px solid #1B4332;white-space:pre-wrap">{data.vraag}</div>
        """
        params = {
            "from": f"Signybon Support <{os.environ.get('SENDER_EMAIL', 'noreply@signybon.com')}>",
            "to": ["info@signybon.com"],
            "reply_to": [data.email],
            "subject": f"[Support] {data.bedrijfsnaam or data.naam}",
            "html": html,
            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return {"success": True, "message": "Ticket verzonden"}
    except Exception as e:
        logging.error(f"Ticket send failed: {e}")
        raise HTTPException(status_code=500, detail="Kon ticket niet verzenden")

# ==================== MASTER PANEL (platform_admin only) ====================
# Real implementations — Prompt 2. All routes share the platform_admin guard,
# which bypasses tenant scoping (platform admin sees all tenants).

_master_guard = require_roles(["platform_admin"])

# Hidden from master panel listings entirely (platform infrastructure)
_LIST_EXCLUDED_COMPANY_IDS = {"signybon_platform"}
# Cannot be blocked / deleted / plan-changed via the master panel
_PROTECTED_COMPANY_IDS = {"signybon_platform", "default_company"}


def _legacy_scope_query(company_id: str, base: Optional[dict] = None) -> dict:
    """Tenant scoping for the master panel — same as _company_scope_query but
    treats default_company as also matching documents whose company_id field
    is missing (legacy Smart-Tech data predating multi-tenant migration)."""
    base = dict(base or {})
    if company_id == "default_company":
        base["$or"] = [{"company_id": "default_company"}, {"company_id": {"$exists": False}}]
    else:
        base["company_id"] = company_id
    return base

PLAN_PRICING = {"basic": 29, "pro": 49, "free": 0}


def _company_status(company: dict) -> str:
    """Resolve effective status from a companies doc."""
    status = (company.get("subscription_status") or "active").lower()
    if status == "trial":
        end = company.get("trial_end_date")
        if end:
            try:
                end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
                if end_dt < datetime.now(timezone.utc):
                    return "expired"
            except Exception:
                pass
    return status


def _days_remaining(iso_date: Optional[str]) -> Optional[int]:
    if not iso_date:
        return None
    try:
        end_dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    except Exception:
        return None
    delta = end_dt - datetime.now(timezone.utc)
    return int(delta.total_seconds() // 86400)


@api_router.get("/master/dashboard-stats")
async def master_dashboard_stats(current_user: Dict = Depends(_master_guard)):
    companies_cursor = db.companies.find(
        {"id": {"$nin": list(_LIST_EXCLUDED_COMPANY_IDS)}},
        {"_id": 0},
    )
    companies = await companies_cursor.to_list(5000)

    counts = {"total": 0, "active": 0, "trial": 0, "expired": 0, "blocked": 0}
    revenue_basic = 0
    revenue_pro = 0
    new_this_month = 0

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    expiring: List[dict] = []
    for c in companies:
        counts["total"] += 1
        status = _company_status(c)
        if status in counts:
            counts[status] += 1
        plan = (c.get("selected_plan") or c.get("pakket") or "").lower()
        if plan == "basic":
            revenue_basic += 1
        elif plan == "pro":
            revenue_pro += 1

        created = c.get("created_at")
        if created:
            try:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if created_dt >= month_start:
                    new_this_month += 1
            except Exception:
                pass

        if status == "trial":
            days = _days_remaining(c.get("trial_end_date"))
            if days is not None and 0 <= days <= 10:
                expiring.append({
                    "company_id": c.get("id"),
                    "bedrijfsnaam": c.get("bedrijfsnaam") or "",
                    "email": c.get("email") or c.get("contact_email") or "",
                    "trial_end_date": c.get("trial_end_date"),
                    "days_remaining": days,
                })

    expiring.sort(key=lambda x: x["days_remaining"])

    # Smart-Tech (default_company) legacy docs may have no company_id field at
    # all, so we count anything that is NOT explicitly the platform tenant.
    _exclude_filter = {"company_id": {"$nin": list(_LIST_EXCLUDED_COMPANY_IDS)}}
    total_werkbonnen = await db.werkbonnen.count_documents(_exclude_filter)
    total_users = await db.users.count_documents(_exclude_filter)

    revenue = revenue_basic * PLAN_PRICING["basic"] + revenue_pro * PLAN_PRICING["pro"]

    return {
        "companies": counts,
        "new_this_month": new_this_month,
        "total_werkbonnen": total_werkbonnen,
        "total_users": total_users,
        "revenue_monthly": revenue,
        "revenue_breakdown": {"basic": revenue_basic, "pro": revenue_pro},
        "expiring_trials": expiring,
    }


@api_router.get("/master/klanten")
async def master_list_klanten(
    status: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: Dict = Depends(_master_guard),
):
    query: dict = {"id": {"$nin": list(_LIST_EXCLUDED_COMPANY_IDS)}}
    if plan:
        query["selected_plan"] = plan
    if search:
        query["$or"] = [
            {"bedrijfsnaam": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}},
            {"btw_nummer": {"$regex": search, "$options": "i"}},
        ]
    companies = await db.companies.find(query, {"_id": 0}).to_list(2000)

    result = []
    for c in companies:
        cid = c.get("id")
        effective_status = _company_status(c)
        if status and effective_status != status:
            continue

        instellingen = await db.instellingen.find_one(
            {"id": "company_settings", "company_id": cid},
            {"_id": 0, "voornaam": 1, "achternaam": 1},
        ) or {}
        contact = (
            (instellingen.get("voornaam") or "") + " " + (instellingen.get("achternaam") or "")
        ).strip()

        scope = _legacy_scope_query(cid)
        werkbon_count = await db.werkbonnen.count_documents(scope)
        user_count = await db.users.count_documents(scope)

        result.append({
            "company_id": cid,
            "bedrijfsnaam": c.get("bedrijfsnaam") or "",
            "contactpersoon": contact,
            "email": c.get("email") or c.get("contact_email") or "",
            "telefoon": c.get("telefoon") or "",
            "btw_nummer": c.get("btw_nummer") or "",
            "plan": c.get("selected_plan") or c.get("pakket") or "",
            "status": effective_status,
            "created_at": c.get("created_at"),
            "trial_end_date": c.get("trial_end_date"),
            "days_remaining": _days_remaining(c.get("trial_end_date")),
            "werkbonnen": werkbon_count,
            "gebruikers": user_count,
        })

    result.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return result


@api_router.get("/master/klanten/{company_id}")
async def master_klant_detail(company_id: str, current_user: Dict = Depends(_master_guard)):
    if company_id in _LIST_EXCLUDED_COMPANY_IDS:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")

    instellingen = await db.instellingen.find_one(
        {"id": "company_settings", "company_id": company_id}, {"_id": 0}
    ) or {}

    # default_company also matches docs that have no company_id field at all
    # (legacy Smart-Tech data from before multi-tenant migration)
    werknemers = await db.users.find(
        _legacy_scope_query(company_id),
        {"_id": 0, "id": 1, "naam": 1, "email": 1, "rol": 1, "actief": 1},
    ).to_list(500)

    klanten = await db.klanten.find(
        _legacy_scope_query(company_id),
        {"_id": 0, "id": 1, "bedrijfsnaam": 1, "naam": 1, "email": 1, "algemeen_email": 1},
    ).to_list(2000)

    werven_raw = await db.werven.find(
        _legacy_scope_query(company_id),
        {"_id": 0, "id": 1, "naam": 1, "klant_id": 1},
    ).to_list(2000)
    klant_name_map = {
        k.get("id"): (k.get("bedrijfsnaam") or k.get("naam") or "") for k in klanten
    }
    werven = [
        {"id": w.get("id"), "naam": w.get("naam") or "", "klant_naam": klant_name_map.get(w.get("klant_id"), "")}
        for w in werven_raw
    ]

    werkbon_total = await db.werkbonnen.count_documents(_legacy_scope_query(company_id))
    werkbonnen_recent_raw = await db.werkbonnen.find(
        _legacy_scope_query(company_id),
        {"_id": 0, "id": 1, "datum": 1, "created_at": 1, "type": 1, "status": 1, "klant_id": 1, "werf_id": 1},
    ).sort("created_at", -1).limit(10).to_list(10)
    werf_name_map = {w.get("id"): w.get("naam") or "" for w in werven_raw}
    werkbonnen_recent = [
        {
            "id": w.get("id"),
            "datum": w.get("datum") or w.get("created_at"),
            "klant_naam": klant_name_map.get(w.get("klant_id"), ""),
            "werf_naam": werf_name_map.get(w.get("werf_id"), ""),
            "type": w.get("type") or "",
            "status": w.get("status") or "",
        }
        for w in werkbonnen_recent_raw
    ]

    subscription = {
        "status": _company_status(company),
        "plan": company.get("selected_plan") or company.get("pakket") or "",
        "trial_start_date": company.get("trial_start_date"),
        "trial_end_date": company.get("trial_end_date"),
        "days_remaining": _days_remaining(company.get("trial_end_date")),
    }

    contactpersoon = ((instellingen.get("voornaam") or "") + " " + (instellingen.get("achternaam") or "")).strip()

    return {
        "company": {
            "company_id": company_id,
            "bedrijfsnaam": company.get("bedrijfsnaam") or instellingen.get("bedrijfsnaam") or "",
            "btw_nummer": company.get("btw_nummer") or instellingen.get("btw_nummer") or "",
            "email": company.get("email") or instellingen.get("email") or "",
            "telefoon": company.get("telefoon") or instellingen.get("telefoon") or "",
            "contactpersoon": contactpersoon,
            "adres": instellingen.get("adres_gestructureerd") or {},
            "created_at": company.get("created_at"),
        },
        "subscription": subscription,
        "werknemers": werknemers,
        "klanten": [
            {
                "id": k.get("id"),
                "naam": k.get("bedrijfsnaam") or k.get("naam") or "",
                "email": k.get("algemeen_email") or k.get("email") or "",
            }
            for k in klanten
        ],
        "werven": werven,
        "werkbonnen": {"total": werkbon_total, "recent": werkbonnen_recent},
    }


def _ensure_unprotected(company_id: str):
    if company_id in _PROTECTED_COMPANY_IDS:
        raise HTTPException(status_code=400, detail="Beschermd bedrijf — niet wijzigbaar")


@api_router.post("/master/klanten/{company_id}/block")
async def master_klant_block(company_id: str, current_user: Dict = Depends(_master_guard)):
    _ensure_unprotected(company_id)
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "subscription_status": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    previous = company.get("subscription_status") or "active"
    if previous == "blocked":
        previous = "active"
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"subscription_status": "blocked", "previous_status": previous}},
    )
    return {"ok": True}


@api_router.post("/master/klanten/{company_id}/unblock")
async def master_klant_unblock(company_id: str, current_user: Dict = Depends(_master_guard)):
    _ensure_unprotected(company_id)
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "previous_status": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    restore = company.get("previous_status") or "active"
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"subscription_status": restore}, "$unset": {"previous_status": ""}},
    )
    return {"ok": True, "status": restore}


class MasterExtendTrialBody(BaseModel):
    end_date: str

@api_router.post("/master/klanten/{company_id}/extend-trial")
async def master_klant_extend_trial(
    company_id: str,
    body: MasterExtendTrialBody,
    current_user: Dict = Depends(_master_guard),
):
    _ensure_unprotected(company_id)
    try:
        end_dt = datetime.fromisoformat(body.end_date.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Ongeldige datum (gebruik ISO 8601)")
    res = await db.companies.update_one(
        {"id": company_id},
        {"$set": {
            "trial_end_date": end_dt.isoformat(),
            "subscription_status": "trial",
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    return {"ok": True, "end_date": end_dt.isoformat()}


class MasterChangePlanBody(BaseModel):
    plan: str

@api_router.post("/master/klanten/{company_id}/change-plan")
async def master_klant_change_plan(
    company_id: str,
    body: MasterChangePlanBody,
    current_user: Dict = Depends(_master_guard),
):
    _ensure_unprotected(company_id)
    plan = (body.plan or "").lower().strip()
    if plan not in PLAN_PRICING:
        raise HTTPException(status_code=400, detail="Ongeldig plan")
    # Also flip subscription_status so middleware treats this company as
    # actively paying (or free) rather than a (possibly expired) trial.
    if plan == "free":
        new_status = "active"
    else:
        new_status = f"active_{plan}"
    res = await db.companies.update_one(
        {"id": company_id},
        {"$set": {"selected_plan": plan, "pakket": plan, "subscription_status": new_status}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bedrijf niet gevonden")
    return {"ok": True, "plan": plan, "status": new_status}


class MasterDeleteBody(BaseModel):
    confirm: str

@api_router.delete("/master/klanten/{company_id}")
async def master_klant_delete(
    company_id: str,
    body: MasterDeleteBody,
    current_user: Dict = Depends(_master_guard),
):
    _ensure_unprotected(company_id)
    if body.confirm != "DELETE":
        raise HTTPException(status_code=400, detail="confirm must equal DELETE")
    deleted: Dict[str, int] = {}
    for coll in ("instellingen", "klanten", "werven", "werkbonnen", "planning", "berichten", "teams", "users"):
        r = await db[coll].delete_many({"company_id": company_id})
        deleted[coll] = r.deleted_count
    r = await db.companies.delete_many({"id": company_id})
    deleted["companies"] = r.deleted_count
    return {"ok": True, "deleted": deleted}


@api_router.get("/master/tickets")
async def master_list_tickets(current_user: Dict = Depends(_master_guard)):
    tickets = await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return tickets


class MasterTicketReplyBody(BaseModel):
    message: str

@api_router.post("/master/tickets/{ticket_id}/reply")
async def master_ticket_reply(
    ticket_id: str,
    body: MasterTicketReplyBody,
    current_user: Dict = Depends(_master_guard),
):
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket niet gevonden")
    reply = {
        "message": body.message,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "by": "Signybon Support",
    }
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$push": {"replies": reply}, "$set": {"status": "beantwoord"}},
    )

    if resend.api_key and ticket.get("email"):
        try:
            html = f"""
            <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f5f6fa;padding:20px">
              <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
                <div style="background:#1B4332;color:#fff;padding:30px;text-align:center">
                  <h1 style="color:#D4A017;margin:0;font-size:28px;font-weight:900;letter-spacing:1px">SIGNYBON</h1>
                  <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Support</p>
                </div>
                <div style="padding:30px">
                  <h2 style="color:#1B4332;margin:0 0 14px;font-size:20px">Signybon Support heeft uw vraag beantwoord</h2>
                  <p style="color:#495057;font-size:14px;margin:0 0 18px">Beste {ticket.get('naam', '')},</p>
                  <p style="color:#495057;font-size:14px;margin:0 0 14px"><b>Uw vraag:</b></p>
                  <div style="background:#f8f9fa;padding:14px;border-radius:8px;border-left:4px solid #adb5bd;color:#495057;white-space:pre-wrap;font-size:13px">{ticket.get('vraag', '')}</div>
                  <p style="color:#495057;font-size:14px;margin:18px 0 14px"><b>Ons antwoord:</b></p>
                  <div style="background:#f8f9fa;padding:14px;border-radius:8px;border-left:4px solid #1B4332;color:#1B4332;white-space:pre-wrap;font-size:14px">{body.message}</div>
                  <p style="color:#6c757d;font-size:12px;margin-top:24px">Met vriendelijke groet,<br/>Signybon Support</p>
                </div>
              </div>
            </div>
            """
            await asyncio.to_thread(resend.Emails.send, {
                "from": f"Signybon Support <{os.environ.get('SENDER_EMAIL', 'noreply@signybon.com')}>",
                "to": [ticket["email"]],
                "subject": "Signybon Support heeft uw vraag beantwoord",
                "html": html,
                "reply_to": ["info@signybon.com"],
                "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
            })
        except Exception as exc:
            logging.warning("[master/ticket reply] email send failed: %s", exc)

    return {"ok": True}


class MasterTicketStatusBody(BaseModel):
    status: str

@api_router.post("/master/tickets/{ticket_id}/status")
async def master_ticket_status(
    ticket_id: str,
    body: MasterTicketStatusBody,
    current_user: Dict = Depends(_master_guard),
):
    if body.status not in ("open", "beantwoord", "gesloten"):
        raise HTTPException(status_code=400, detail="Ongeldige status")
    res = await db.support_tickets.update_one(
        {"id": ticket_id}, {"$set": {"status": body.status}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket niet gevonden")
    return {"ok": True, "status": body.status}


class MasterAnnouncementBody(BaseModel):
    subject: str
    content: str
    target: Optional[str] = "all"  # all | trial | basic | pro

@api_router.post("/master/announcements")
async def master_create_announcement(
    body: MasterAnnouncementBody,
    current_user: Dict = Depends(_master_guard),
):
    target = (body.target or "all").lower()
    if target not in ("all", "trial", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Ongeldige doelgroep")

    query: dict = {"id": {"$nin": list(_LIST_EXCLUDED_COMPANY_IDS)}}
    if target == "trial":
        query["subscription_status"] = "trial"
    elif target in ("basic", "pro"):
        query["selected_plan"] = target

    companies = await db.companies.find(query, {"_id": 0, "id": 1}).to_list(5000)
    company_ids = [c["id"] for c in companies if c.get("id")]

    sent_count = 0
    if resend.api_key and company_ids:
        recipient_users = await db.users.find(
            {"company_id": {"$in": company_ids}, "rol": {"$in": ["master_admin", "admin"]}, "actief": True},
            {"_id": 0, "email": 1, "naam": 1},
        ).to_list(20000)
        seen = set()
        for u in recipient_users:
            email_addr = (u.get("email") or "").strip().lower()
            if not email_addr or email_addr in seen:
                continue
            seen.add(email_addr)
            try:
                html = f"""
                <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:620px;margin:0 auto;background:#f5f6fa;padding:20px">
                  <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
                    <div style="background:#1B4332;color:#fff;padding:30px;text-align:center">
                      <h1 style="color:#D4A017;margin:0;font-size:28px;font-weight:900;letter-spacing:1px">SIGNYBON</h1>
                    </div>
                    <div style="padding:30px;color:#1B4332">
                      <h2 style="margin:0 0 16px;font-size:20px">{body.subject}</h2>
                      <div style="font-size:14px;color:#495057;white-space:pre-wrap;line-height:1.6">{body.content}</div>
                      <p style="color:#6c757d;font-size:12px;margin-top:24px">Met vriendelijke groet,<br/>Het Signybon team</p>
                    </div>
                  </div>
                </div>
                """
                await asyncio.to_thread(resend.Emails.send, {
                    "from": f"Signybon <{os.environ.get('SENDER_EMAIL', 'noreply@signybon.com')}>",
                    "to": [email_addr],
                    "subject": f"[Signybon] {body.subject}",
                    "html": html,
                    "reply_to": ["info@signybon.com"],
                    "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
                })
                sent_count += 1
            except Exception as exc:
                logging.warning("[master/announcement] send to %s failed: %s", email_addr, exc)

    doc = {
        "id": str(uuid.uuid4()),
        "subject": body.subject,
        "content": body.content,
        "target": target,
        "company_count": len(company_ids),
        "sent_count": sent_count,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(doc.copy())
    return {"ok": True, "sent_count": sent_count, "company_count": len(company_ids)}


@api_router.get("/master/announcements")
async def master_list_announcements(current_user: Dict = Depends(_master_guard)):
    docs = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

app.include_router(api_router)

# Trial expiration middleware — block API access after 30-day trial expires
TRIAL_ALLOWED_PREFIXES = (
    "/api/auth/",
    "/api/instellingen",
    "/api/subscription/",
    "/api/help/",
    "/api/health",
    "/api/app-settings",
    "/api/public/",
    "/api/master/",  # Platform admin endpoints — never blocked by trial
    "/api/_admin/",  # One-shot maintenance endpoints — never blocked by trial
)

@app.middleware("http")
async def trial_check_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method.upper()
    # Only check /api/* endpoints
    if not path.startswith("/api/"):
        return await call_next(request)
    # Allow always-accessible endpoints
    if any(path.startswith(p) for p in TRIAL_ALLOWED_PREFIXES):
        return await call_next(request)
    # Reads are always allowed — users can still browse their dashboard
    # even while their plan picker is up. Writes go through plan check.
    if method == "GET":
        return await call_next(request)
    # Try to read JWT to get company_id
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return await call_next(request)
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        company_id = payload.get("company_id")
        if company_id:
            sub, _plan, _company = await _resolve_company_plan(company_id)
            if sub.get("requires_plan_selection"):
                from starlette.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "Kies een abonnement om door te gaan.",
                        "requires_plan_selection": True,
                    },
                )
            if sub.get("status") == "blocked":
                from starlette.responses import JSONResponse
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Uw account is geblokkeerd. Neem contact op met support."},
                )
    except Exception:
        pass
    return await call_next(request)

_cors_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
_allowed_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def ensure_indexes():
    """Create MongoDB indexes for query performance."""
    try:
        # werkbonnen
        await db.werkbonnen.create_index([("ingevuld_door_id", 1), ("created_at", -1)])
        await db.werkbonnen.create_index([("created_at", -1)])
        await db.werkbonnen.create_index([("klant_id", 1)])
        await db.werkbonnen.create_index([("werf_id", 1)])
        await db.werkbonnen.create_index([("week_nummer", 1), ("jaar", 1)])
        await db.werkbonnen.create_index([("status", 1)])
        # users
        await db.users.create_index([("email", 1)], unique=True)
        await db.users.create_index([("company_id", 1)])
        # klanten
        await db.klanten.create_index([("id", 1)], unique=True)
        await db.klanten.create_index([("actief", 1)])
        # werven
        await db.werven.create_index([("klant_id", 1)])
        # teams
        await db.teams.create_index([("id", 1)], unique=True)
        # berichten
        await db.berichten.create_index([("ontvanger_ids", 1), ("created_at", -1)])
        # Multi-tenant indexes
        await db.werkbonnen.create_index([("company_id", 1), ("created_at", -1)])
        await db.klanten.create_index([("company_id", 1)])
        await db.werven.create_index([("company_id", 1)])
        await db.planning.create_index([("company_id", 1)])
        await db.berichten.create_index([("company_id", 1)])
        await db.teams.create_index([("company_id", 1)])
        await db.instellingen.create_index([("company_id", 1)])
        logging.info("[DB] Indexes ensured successfully")
    except Exception as idx_err:
        logging.warning(f"[DB] Index creation warning (may already exist): {idx_err}")

    # Bootstrap: ensure the Signybon platform owner account exists.
    # Idempotent — only inserts when missing, never overwrites existing data.
    try:
        existing_admin = await db.users.find_one({"email": PLATFORM_ADMIN_EMAIL})
        if not existing_admin:
            bootstrap_password = os.environ.get("PLATFORM_ADMIN_PASSWORD") or "Signybon2026!"
            now_iso = datetime.now(timezone.utc).isoformat()
            platform_user = {
                "id": str(uuid.uuid4()),
                "email": PLATFORM_ADMIN_EMAIL,
                "naam": "Signybon Platform",
                "rol": "platform_admin",
                "company_id": "signybon_platform",
                "password_hash": hash_password(bootstrap_password),
                "actief": True,
                "email_verified": True,
                "status": "active",
                "web_access": True,
                "app_access": False,
                "werkbon_types": ["uren"],
                "created_at": now_iso,
            }
            await db.users.insert_one(platform_user)
            logging.info("[bootstrap] Created platform_admin user %s", PLATFORM_ADMIN_EMAIL)
        else:
            # Idempotent role repair — never touch password
            if existing_admin.get("rol") != "platform_admin" or not existing_admin.get("actief"):
                await db.users.update_one(
                    {"email": PLATFORM_ADMIN_EMAIL},
                    {"$set": {"rol": "platform_admin", "actief": True, "status": "active"}},
                )
                logging.info("[bootstrap] Repaired platform_admin role for %s", PLATFORM_ADMIN_EMAIL)

        existing_company = await db.companies.find_one({"id": "signybon_platform"})
        if not existing_company:
            await db.companies.insert_one({
                "id": "signybon_platform",
                "bedrijfsnaam": "Signybon",
                "email": PLATFORM_ADMIN_EMAIL,
                "contact_email": PLATFORM_ADMIN_EMAIL,
                "subscription_status": "active",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logging.info("[bootstrap] Created signybon_platform company doc")

        # Smart-Tech legacy bootstrap: surface the original tenant in the
        # master panel by writing a companies document for default_company.
        # Pulls bedrijfsnaam / email / btw_nummer from the existing
        # instellingen doc so the listing reflects real values. Idempotent.
        existing_default = await db.companies.find_one({"id": "default_company"})
        if not existing_default:
            legacy_inst = await db.instellingen.find_one(
                {"id": "company_settings", "company_id": "default_company"},
                {"_id": 0},
            ) or await db.instellingen.find_one(
                {"id": "company_settings", "company_id": {"$exists": False}},
                {"_id": 0},
            ) or {}
            legacy_email = (
                legacy_inst.get("email")
                or (legacy_inst.get("emails") or {}).get("inkomend_werkbon")
                or ""
            )
            await db.companies.insert_one({
                "id": "default_company",
                "bedrijfsnaam": legacy_inst.get("bedrijfsnaam") or "Smart-Tech",
                "email": legacy_email,
                "contact_email": legacy_email,
                "btw_nummer": legacy_inst.get("btw_nummer") or "",
                "telefoon": legacy_inst.get("telefoon") or "",
                "subscription_status": "active",
                "selected_plan": "pro",
                "pakket": "pro",
                "created_at": "2024-01-01T00:00:00+00:00",
            })
            logging.info("[bootstrap] Created legacy default_company entry for master panel visibility")
    except Exception as boot_err:
        logging.warning("[bootstrap] platform admin bootstrap warning: %s", boot_err)

    # Migration: set company_id="default_company" on legacy docs missing it
    try:
        for coll_name in ("werkbonnen", "klanten", "werven", "planning", "berichten", "teams", "users", "instellingen"):
            res = await db[coll_name].update_many(
                {"company_id": {"$exists": False}},
                {"$set": {"company_id": "default_company"}},
            )
            if res.modified_count > 0:
                logging.info(f"[DB migration] {coll_name}: set company_id on {res.modified_count} legacy docs")
    except Exception as mig_err:
        logging.warning(f"[DB migration] warning: {mig_err}")

    # Spawn the daily trial-notification task as a background coroutine.
    # asyncio.create_task is non-blocking — startup completes immediately.
    try:
        asyncio.create_task(_trial_notification_loop())
        logging.info("[trial-notify] daily background task scheduled")
    except Exception as task_err:
        logging.warning(f"[trial-notify] could not schedule task: {task_err}")


async def _trial_notification_loop():
    """Daily background loop. Emails trial expiry warnings to companies and a
    summary to info@signybon.com. Wakes once every 24h, sleeps quietly on
    failure rather than crashing the loop."""
    REMIND_DAYS = {10, 5, 3, 1, 0}
    while True:
        try:
            now = datetime.now(timezone.utc)
            companies = await db.companies.find(
                {
                    "id": {"$nin": list(_LIST_EXCLUDED_COMPANY_IDS)},
                    "subscription_status": "trial",
                    "trial_end_date": {"$exists": True},
                },
                {"_id": 0},
            ).to_list(5000)

            expiring_today: List[dict] = []
            expiring_soon: List[dict] = []
            for c in companies:
                days = _days_remaining(c.get("trial_end_date"))
                if days is None:
                    continue
                if days < 0:
                    expiring_today.append(c)  # already expired counts as "today"
                    continue
                if days == 0:
                    expiring_today.append(c)
                if days in REMIND_DAYS:
                    expiring_soon.append({"company": c, "days": days})

            if resend.api_key:
                # Per-tenant warnings
                for entry in expiring_soon:
                    c = entry["company"]
                    days = entry["days"]
                    target_email = c.get("email") or c.get("contact_email")
                    if not target_email:
                        continue
                    if days == 0:
                        subject = "Uw Signybon proefperiode is vandaag verlopen"
                        msg = "Uw proefperiode is vandaag verlopen. Activeer uw abonnement op signybon.com om uw account actief te houden."
                    else:
                        subject = f"Uw Signybon proefperiode verloopt over {days} dag" + ("" if days == 1 else "en")
                        msg = f"Uw proefperiode verloopt over {days} dag" + ("" if days == 1 else "en") + ". Activeer uw abonnement op signybon.com."
                    try:
                        html = f"""
                        <div style='font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f5f6fa;padding:20px'>
                          <div style='background:#fff;border-radius:14px;overflow:hidden'>
                            <div style='background:#1B4332;color:#fff;padding:30px;text-align:center'>
                              <h1 style='color:#D4A017;margin:0;font-size:28px;font-weight:900;letter-spacing:1px'>SIGNYBON</h1>
                            </div>
                            <div style='padding:30px;color:#1B4332'>
                              <h2 style='margin:0 0 14px;font-size:20px'>{subject}</h2>
                              <p style='font-size:14px;color:#495057;line-height:1.6'>{msg}</p>
                              <p style='margin-top:24px'><a href='https://signybon.com' style='display:inline-block;background:#1B4332;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700'>Activeer abonnement</a></p>
                            </div>
                          </div>
                        </div>
                        """
                        await asyncio.to_thread(resend.Emails.send, {
                            "from": f"Signybon <{os.environ.get('SENDER_EMAIL', 'noreply@signybon.com')}>",
                            "to": [target_email],
                            "subject": subject,
                            "html": html,
                            "reply_to": ["info@signybon.com"],
                            "headers": {"List-Unsubscribe": "<mailto:info@signybon.com>"},
                        })
                    except Exception as exc:
                        logging.warning("[trial-notify] send to %s failed: %s", target_email, exc)

                # Daily overview to platform owner
                try:
                    summary_html = f"""
                    <div style='font-family:Arial,sans-serif;max-width:620px;margin:0 auto'>
                      <h2 style='color:#1B4332'>Signybon — Trial overzicht</h2>
                      <p><b>Vandaag verlopen:</b> {len(expiring_today)} bedrijven</p>
                      <p><b>Binnenkort verlopen:</b> {len(expiring_soon)} bedrijven</p>
                    </div>
                    """
                    await asyncio.to_thread(resend.Emails.send, {
                        "from": f"Signybon <{os.environ.get('SENDER_EMAIL', 'noreply@signybon.com')}>",
                        "to": [PLATFORM_ADMIN_EMAIL],
                        "subject": "Signybon — Dagelijks trial overzicht",
                        "html": summary_html,
                    })
                except Exception as exc:
                    logging.warning("[trial-notify] summary send failed: %s", exc)
        except Exception as loop_err:
            logging.warning("[trial-notify] loop iteration failed: %s", loop_err)
        await asyncio.sleep(86400)  # 24 hours


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.on_event("startup")
async def startup_migrate():
    """
    Phase 1 SaaS Migration:

    - Add company_id to all models
    - Normalize roles (ploegbaas -> worker, werknemer -> worker, etc.)
    - Remove wachtwoord_plain from database
    - Add new structured fields to company settings
    - Create indexes for performance
    """
    # === EMAIL CONFIG CHECK ===
    _resend_key = os.environ.get('RESEND_API_KEY', '')
    if _resend_key:
        logging.info("[EMAIL] RESEND_API_KEY configured (length=%d)", len(_resend_key))
    else:
        logging.warning("[EMAIL] RESEND_API_KEY NOT SET - emails will be skipped!")
    logging.info("[EMAIL] Werkbon recipient: %s | Sender: %s", WERKBON_RECIPIENT_EMAIL, SENDER_EMAIL)

    try:
        DEFAULT_COMPANY_ID = "default_company"

        # === CREATE INDEXES for performance ===
        # This prevents "Sort exceeded memory limit" errors
        await ensure_indexes()

        # === ONE-SHOT: drop orphan ekrem@smart-techbv.be in default_company ===
        # Werknemer was created before register-worker company_id fix landed,
        # so it's invisible in the E.K Consulting tenant and blocks re-add.
        try:
            orphan_drop = await db.users.delete_one(
                {"email": "ekrem@smart-techbv.be", "company_id": "default_company"}
            )
            if orphan_drop.deleted_count:
                logging.info("[migrate] Dropped orphan user ekrem@smart-techbv.be from default_company")
        except Exception as orphan_err:
            logging.warning("[migrate] Orphan ekrem drop failed: %s", orphan_err)


        # === PHASE 1: User migrations ===
        
        # 1. Add company_id to all users
        await db.users.update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": DEFAULT_COMPANY_ID}}
        )
        
        # 2. Add missing standard fields
        await db.users.update_many(
            {"werkbon_types": {"$exists": False}},
            {"$set": {"werkbon_types": ["uren"]}}
        )
        await db.users.update_many(
            {"mag_wachtwoord_wijzigen": {"$exists": False}},
            {"$set": {"mag_wachtwoord_wijzigen": True}}  # Default TRUE now
        )
        await db.users.update_many(
            {"telefoon": {"$exists": False}},
            {"$set": {"telefoon": None}}
        )
        await db.users.update_many(
            {"must_change_password": {"$exists": False}},
            {"$set": {"must_change_password": False}}
        )
        await db.users.update_many(
            {"password_changed_at": {"$exists": False}},
            {"$set": {"password_changed_at": None}}
        )
        
        # 3. Normalize legacy roles to V1 role system
        role_migrations = [
            ("werknemer", "worker"),
            ("ploegbaas", "worker"),      # ploegbaas -> worker
            ("beheerder", "admin"),       # beheerder -> admin (V1)
            ("manager", "planner"),       # manager -> planner (V1: manager removed)
        ]
        for old_role, new_role in role_migrations:
            result = await db.users.update_many(
                {"rol": old_role},
                {"$set": {"rol": new_role}}
            )
            if result.modified_count > 0:
                logging.info(f"V1 Migration: Migrated {result.modified_count} users from '{old_role}' to '{new_role}'")
        
        # 4. Remove wachtwoord_plain from all users (SECURITY)
        await db.users.update_many(
            {"wachtwoord_plain": {"$exists": True}},
            {"$unset": {"wachtwoord_plain": ""}}
        )
        
        # === PHASE 1: Company Settings migrations ===
        
        # Add company_id to settings
        await db.instellingen.update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": DEFAULT_COMPANY_ID}}
        )
        
        # Add new structured fields to settings
        await db.instellingen.update_many(
            {"adres_gestructureerd": {"$exists": False}},
            {"$set": {"adres_gestructureerd": None}}
        )
        await db.instellingen.update_many(
            {"emails": {"$exists": False}},
            {"$set": {"emails": None}}
        )
        await db.instellingen.update_many(
            {"branding": {"$exists": False}},
            {"$set": {"branding": None}}
        )
        await db.instellingen.update_many(
            {"pdf_teksten": {"$exists": False}},
            {"$set": {"pdf_teksten": None}}
        )
        await db.instellingen.update_many(
            {"website": {"$exists": False}},
            {"$set": {"website": None}}
        )
        
        # === PHASE 1: Add company_id to all other collections ===
        collections_to_migrate = [
            "klanten", "werven", "planning", "werkbonnen",
            "oplevering_werkbonnen", "project_werkbonnen",
            "productie_werkbonnen", "teams", "berichten"
        ]
        for coll_name in collections_to_migrate:
            try:
                await db[coll_name].update_many(
                    {"company_id": {"$exists": False}},
                    {"$set": {"company_id": DEFAULT_COMPANY_ID}}
                )
            except Exception as coll_err:
                logging.warning(f"Could not migrate collection {coll_name}: {coll_err}")
        
        logging.info("Phase 1 SaaS migration completed successfully")
        
    except Exception as e:
        logging.error(f"Migration error: {e}")



# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK ENDPOINT (for Railway/Docker deployment)
# ══════════════════════════════════════════════════════════════════════════════



# ══════════════════════════════════════════════════════════════════════════════
# LANDING PAGE
# ══════════════════════════════════════════════════════════════════════════════

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

LANDING_PATH = os.path.join(os.path.dirname(__file__), "landing.html")
REGISTER_PATH = os.path.join(os.path.dirname(__file__), "register.html")
LOGIN_PATH = os.path.join(os.path.dirname(__file__), "login.html")
FAVICON_ICO_PATH = os.path.join(os.path.dirname(__file__), "favicon.ico")
FAVICON_PNG_PATH = os.path.join(os.path.dirname(__file__), "favicon.png")

@app.get("/favicon.ico")
async def serve_favicon_ico():
    return FileResponse(FAVICON_ICO_PATH, media_type="image/x-icon")

@app.get("/favicon.png")
async def serve_favicon_png():
    return FileResponse(FAVICON_PNG_PATH, media_type="image/png")

# HTML must never be browser-cached — stale copies retain old redirects and
# old entry-chunk filenames, which is exactly what caused the double-login
# regression after a backend/dist rebuild.
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.get("/")
async def serve_root():
    return FileResponse(LANDING_PATH, media_type="text/html", headers=_NO_CACHE_HEADERS)


@app.get("/landing")
async def serve_landing():
    return FileResponse(LANDING_PATH, media_type="text/html", headers=_NO_CACHE_HEADERS)


@app.get("/register")
async def serve_register():
    return FileResponse(REGISTER_PATH, media_type="text/html", headers=_NO_CACHE_HEADERS)


@app.get("/signybon-help.js")
async def serve_help_widget():
    return FileResponse(os.path.join(os.path.dirname(__file__), "signybon-help.js"), media_type="application/javascript")


@app.get("/login")
async def serve_login():
    return FileResponse(LOGIN_PATH, media_type="text/html", headers=_NO_CACHE_HEADERS)

# ══════════════════════════════════════════════════════════════════════════════
# STATIC FILE SERVING FOR WEB PANEL (Railway deployment)
# ══════════════════════════════════════════════════════════════════════════════

# Path to the exported web panel files
STATIC_DIR = os.path.join(os.path.dirname(__file__), "dist")

# Serve static files if dist folder exists (production deployment)
if os.path.exists(STATIC_DIR):
    # Mount static assets
    app.mount("/_expo", StaticFiles(directory=os.path.join(STATIC_DIR, "_expo")), name="expo_static")
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")
    
    # Serve index.html for all non-API routes (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}

        # Try the route as a hashed asset first (long-cacheable)
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            # HTML files must never be browser-cached — entry-chunk filenames
            # change on every rebuild but the HTML pointing at them is stable
            # so a cached HTML keeps loading the previous bundle.
            if file_path.endswith(".html"):
                return FileResponse(file_path, headers=_NO_CACHE_HEADERS)
            return FileResponse(file_path)

        # Try with .html extension (expo-router static export — every route
        # has its own .html: /admin/dashboard → admin/dashboard.html). The
        # previous code skipped this branch unless the URL itself ended in
        # ".html", so /admin/dashboard fell through to dist/index.html.
        html_candidate = os.path.join(STATIC_DIR, full_path + ".html")
        if os.path.isfile(html_candidate):
            return FileResponse(html_candidate, headers=_NO_CACHE_HEADERS)

        # If full_path itself ended in .html, try once directly
        if full_path.endswith(".html"):
            html_path = os.path.join(STATIC_DIR, full_path)
            if os.path.isfile(html_path):
                return FileResponse(html_path, headers=_NO_CACHE_HEADERS)

        # Fallback to index.html for SPA routing (also no-cache)
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path, headers=_NO_CACHE_HEADERS)

        return {"detail": "Not Found"}

# (removed)
