from fastapi import FastAPI, APIRouter, HTTPException, Response, Query, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from bson import ObjectId
import os
import logging
import asyncio
import base64
import io
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Set, Any, Union
import uuid
from datetime import datetime, timedelta, timezone
import hashlib
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
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
COMPANY_EMAIL = "info@smart-techbv.be"  # For sending emails TO customers
WERKBON_RECIPIENT_EMAIL = "ts@smart-techbv.be"  # Werkbonnen from workers go HERE

# Company info for PDF (hardcoded as requested)
COMPANY_INFO = {
    "naam": "Smart-Tech BV",
    "adres": "Lochtemanweg 96/10",
    "postcode": "3550",
    "stad": "Heusden-Zolder",
    "land": "België",
    "btw": "BE0747 880 094",
    "email": "info@smart-techbv.be",
    "logo_base64": "iVBORw0KGgoAAAANSUhEUgAAAJYAAABACAYAAAD4Zo7QAAAImElEQVR4nO2ca4hdVxXH/2utfW7uZDJN85jENJ3R1lorVapiPhlalCq2aEGkVTRoQ98f/KDgJ0HBzxYECTQPKSWlrVJBBClVq6URW/ARW7W2ok0zk0wmmUwyk8fcufestZcfzrmPeXaCDgme/YPz5Z7HPWfzP2uv/V97H3J3RyLxP4Yv9w0k/j9JwkqsCklYiVUhCSuxKiRhJVaFJKzEqpCElVgVkrCWZDl7L1l/70QS1pIQsLiCvNyXWIZwuW/gisMjQIR48a1W8/DdwgRp1yaIgBg91j78lMnATTW4A5TezcVIwlpABBCQv/1D9zOHJWYBcAUAOAUgV7GjP1D54F4HYgpdS0CpVtiLAyDE1lmdfekDYJsKThm6PSKBXBG5X+u3/cO5NpgVES5FrfmkFunFDQAQx58xNE6KU634zWO5GZwyYHYy2PGDsTgpXsYbvnJJwuqFBICZjuwjDkLwRUTjEZwJdHQ/I7asOCcF/fkkYbVxA0DQid9YnP5LcKmjG40I3ZFghHMf/PwboqefV4A6kS7RJQmrDREARBvZ40TgrpAIBAOhEF4bJmJ9ew8BiCnHWkhqEaDIn8CwC/80m3g+UOjrRCGCwXmdRh7QQlwo9oU64uRvxc7/VQFOUWseSVgAyi7PbXRfJJ0Vb7swFOB5EzL8gIZ3f1291QSo2OcIoNgSG3nMkZKsBSS7oW0x5NPafOkmJ53MHIXFQESI2rI1t/7dSfp89sX3MksoDVMCQRH5Kl172xuO2qasMEyTtQWkiNXpwuzEj80b48GpjqJqI4A2IJt2qqy7kblvKMjm29V1Fu2RoNMaoHk65GNPlll+6g7bJGGRAIhmI3uJhedYDBbdZfgRwCPDI8nwwxRjT4T3CBaBjR4gQJP10EO1hdW2GE6/aDZ1OHPpQ5FvESjOQtZdp2HrXQJigBhh8DPCAzcqxQaKpotw6YNN/y3TU7+0ZD10qbawyhkMdnSPMzl1moMEURVyzVcMXA829YeWTb3SBNckbL/XotqcMg4zyEb2OJL10KG6rVDW+Oziv9UmngsU6p1iM3kOZP0m23cLAOi/vuf5m98GAJftuwJq6428hXaEotAHO/1CsPOvW7IeCqorrNJVt9F9RtqQotgMgASus5DBO5T7rw+YPZHb2UPBp14Jceaoct9QkC2fVddmmZ+V1oM2xUb3GlKSBaCywmqP+s6rHn8yUMh6oozDQVGGHyQAlB9/wtCaFuiM6LHHIwCE4Yfg4Ngp+biBshp07JkQW2eKJL7iLk41hdVO2sd/omiMiXNpMYBB1gCvv0XD5k8ExJbZ8SeYJYAkg40dZFjDZOPHM96wQ8naSXxpPTROSTzxVNGfVtx6qKawCosh6tHHeI7FQIyo0cPQ7ggEtonn1M69kTnX4VxHvPBW0JM/V4A5DN3n0aJ3knWP4CCkI/sZMGt3k1WlesIqo5VNHsrj1J/CHIvBm0B90HjblwMA15H9YG5Xnh3MRHZsHwB4eNc9Qn3blOIsitFl23p4LdOJX5ezHvTyPOMVQPWEVVoMOrIHBOdei8G1hbDtC8a1zcHOv642+UK3IO0GCnXo5O8yO3c4R7Y+yLYvRtccvdGJGWRH9wCAV9l6qNaTlxZDnDmS26lfzLUYYHDOLAw/QABgoz+aW5BGMfpja7GN7HcAkKH72cMaI5SRqWM9/CrEC2/mVbYeqiWschSnI/sd+cwciwHagGzcqXzVRzPk02rjz/Dc0SI6oz8b/6mgNakycHOQTZ9U18Y862FWdGRvpYeFFRJW22K4oDZ2kHmeaCy6y9CDAED5+LPmM2OhO1rsXsNpDbxxSvTE0wqAZPhBxNhzkBsoy6BjT0lsTWlV64fVEVbHYnjW4sVjPaIp6oK87noNW+8KAKKNHlhQkO5eJ4IDk44+zoDFMHhn4IH399QPHU51oHFS7MTT1v3valEdYRVdVdTRfSRZIICKeh/XyrrgrghZK3b25dym/hhc+ssTed4GuPQjnns12OShvKgffq2oH3LoHENZRnbsAAGopPVQDWG1LYaJ53ObeDm4K6DnAL0I5FOAZBquvZcBID/yKIspU2yA4sUltgY4GuuR7xMAl2u/Kgh9yjoN8hmQnQdTRJz8c6Ynf1bJBRfVWgkdZ8EbdhBnpYVAAtgMaPDTkddel6F1JqfmeNM33PIOZRkCyOCt0xqbp8D17bVw/bca8cSzOcJaAgwOcao3GVGr8fLOI01N7uAAogNyaaElmoCZAHIsXsep1stbUjFhLfWoRZ3wvyMucY1igFA1KiasFeCKlYmhPIZkBcdWjySsxKpQyf5/Id0lYHbk0SYQeYVRKMp7vlHj2sa09GseKWJ1iECMcfb3H8t98tU1HrCsYU4RoKtvatV3viZgkbnfd0ikiNXGI8CBw/u+i9b03U61AVrSe6IAb017dsN3HJwJXDsrpBMFlfRYFqV0x8PgHUL9w0p2oZwuo/M2A9kFUN81GrZ8TnrPTXRJwupQTszjeihKNLq4YEjgmhcloLAutF39xFySsOZQNIds3y3I1hl5vuAIQg4PfRaG7qP2L4mFJGH1QsXEPF47HGTLneV3Gnpyp87SsE8p998Q0vdHlya1yuJQGH4EDorzvzEaI1yGHiEAnL4/ujRJWPMpJ+bJplsDX/2RniVeDIoNyPqb87D5dulMHEwsShLWYrgBYAlD93vUcokXMaIa5NrdDg6SkvblScJajLb1sO1LjPqgkTdB3gKt2aCybVcZplLTLUdqnUUpJ+ZlG0K45h5zbcGtCd76eeP61iJapaR9WVLrLA+F4YfIuRadJIbhh1PdZoWkOsRSFMvwwQMfCnzVLeo2Q3L1jgDElLSvgCSs5XAHCByu+6bD8wignMVwuW/syifNbkisCinHWhHpU+6XSuoKV0Tq+y6VFLESq0ISVmJVSMJKrApJWIlV4T/Kxjp8L/rFvQAAAABJRU5ErkJggg=="
}

# Legal text for signature (used in all werkbons) - Updated per user request
LEGAL_TEXT = (
    "Door ondertekening bevestigt de klant de juistheid van alle bovenstaande gegevens. "
    "Deze werkbon dient als grondslag voor facturatie. "
    "Bezwaren dienen schriftelijk gemeld te worden aan info@smart-techbv.be binnen 5 werkdagen na ondertekening, "
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

# ==================== GRIDFS HELPER FUNCTIONS ====================

async def store_file_to_gridfs(data: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Store binary data to GridFS and return the file_id as string"""
    try:
        file_id = await gridfs_bucket.upload_from_stream(
            filename,
            data,
            metadata={"content_type": content_type, "uploaded_at": datetime.utcnow().isoformat()}
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
        except:
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
    except:
        return None

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# ==================== ROLE & PERMISSION SYSTEM ====================

# Valid roles in the system
VALID_ROLES: Set[str] = {
    "master_admin",
    "admin",
    "planner",
    "worker",
    "onderaannemer"
}

# Platform access rules - V1
# Web panel: master_admin, admin, planner
# Mobile app: worker, onderaannemer
WEB_PANEL_ROLES: Set[str] = {"master_admin", "admin", "planner"}
MOBILE_APP_ROLES: Set[str] = {"worker", "onderaannemer"}

# Legacy role mapping - V1
# All legacy roles map to V1 valid roles
LEGACY_ROLE_MAPPING: Dict[str, str] = {
    "admin": "admin",
    "beheerder": "admin",       # beheerder -> admin (was manager)
    "manager": "planner",       # manager -> planner (manager removed in V1)
    "ploegbaas": "worker",      # ploegbaas -> worker
    "werknemer": "worker",      # werknemer -> worker
    "onderaannemer": "onderaannemer"
}

# Roles that each role can assign (for safe role assignment) - V1
ROLE_ASSIGNMENT_PERMISSIONS: Dict[str, Set[str]] = {
    "master_admin": {"master_admin", "admin", "planner", "worker", "onderaannemer"},
    "admin": {"admin", "planner", "worker", "onderaannemer"},
    "planner": set(),  # Planner cannot assign roles
    "worker": set(),
    "onderaannemer": set(),
}

# Permissions per role - V1
ROLE_PERMISSIONS: Dict[str, Dict[str, bool]] = {
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
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.utcnow(),
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
    
    # Return validated user data with normalized role
    return {
        "user_id": user["id"],
        "email": user["email"],
        "naam": user.get("naam", ""),
        "role": normalize_role(user.get("rol", "worker")),
        "company_id": user.get("company_id", "default_company"),
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
    uitgaand_algemeen: Optional[str] = None   # e.g., info@smart-techbv.be
    inkomend_werkbon: Optional[str] = None    # e.g., ts@smart-techbv.be

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
    bedrijfsnaam: str = "Smart-Tech BV"
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

def get_company_logo(settings: dict) -> Optional[str]:
    """Get company logo - prefer new URL, fallback to base64"""
    branding = settings.get("branding")
    if branding and isinstance(branding, dict):
        logo_url = branding.get("logo_url")
        if logo_url:
            return logo_url
    # Fallback to legacy base64
    return settings.get("logo_base64")

def get_company_color(settings: dict, color_type: str = "primary") -> str:
    """Get company color - prefer new structured fields, fallback to legacy"""
    branding = settings.get("branding")
    if branding and isinstance(branding, dict):
        if color_type == "primary":
            color = branding.get("primaire_kleur")
        else:
            color = branding.get("accent_kleur")
        if color:
            return color
    # Fallback to legacy
    if color_type == "primary":
        return settings.get("primary_color") or "#1a1a2e"
    return settings.get("accent_color") or settings.get("secondary_color") or "#F5A623"

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

# Pricing models
PRIJS_MODELLEN = ["uurtarief", "vaste_prijs", "regie", "nog_te_bepalen"]

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
    prijsmodel: str = "uurtarief"             # uurtarief / vaste_prijs / regie / nog_te_bepalen
    standaard_uurtarief: float = 0.0
    uurtarief: float = 0.0                    # Legacy field - maps to standaard_uurtarief
    standaard_dagtarief: float = 0.0
    standaard_vaste_prijs: float = 0.0
    betaaltermijn: int = 30                   # Payment terms in days: 30 / 45 / 60
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
    standaard_dagtarief: float = 0.0
    standaard_vaste_prijs: float = 0.0
    betaaltermijn: int = 30
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

# Helper function to generate klantnummer
async def generate_klantnummer(db) -> str:
    """Generate unique klantnummer in format KL-YYYY-NNNN"""
    year = datetime.utcnow().year
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
        except:
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
    klant_dict.setdefault("standaard_vaste_prijs", 0.0)
    klant_dict.setdefault("betaaltermijn", 30)
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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class WerkbonCreate(BaseModel):
    week_nummer: int
    jaar: int
    klant_id: str
    werf_id: str
    uren: List[UrenRegel]
    km_afstand: Optional[KmRegel] = None
    uitgevoerde_werken: str = ""
    extra_materialen: str = ""

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
    
    bedrijfsnaam: str = "Smart-Tech BV"
    email: str = "info@smart-techbv.be"
    admin_emails: List[str] = ["info@smart-techbv.be"]  # Admin email addresses
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
    
    ondernemingsnummer: Optional[str] = None  # Belgian enterprise number

    # === NEW STRUCTURED FIELDS (Phase 1) ===
    adres_gestructureerd: Optional[Dict] = None
    emails: Optional[Dict] = None
    branding: Optional[Dict] = None
    pdf_teksten: Optional[Dict] = None

class BedrijfsInstellingenUpdate(BaseModel):
    bedrijfsnaam: Optional[str] = None
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
    # NEW structured fields - support both naming conventions
    adres_gestructureerd: Optional[Dict] = None
    adres_structured: Optional[Dict] = None    # Frontend sends this
    emails: Optional[Dict] = None
    branding: Optional[Dict] = None
    pdf_teksten: Optional[Dict] = None
    pdf_texts: Optional[Dict] = None           # Frontend sends this

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
    """Check if user is admin based on email"""
    settings = await db.instellingen.find_one({"id": "company_settings"})
    if settings and "admin_emails" in settings:
        return email.lower() in [e.lower() for e in settings["admin_emails"]]
    # Default admin email
    return email.lower() == "info@smart-techbv.be"

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
            "html": html_content
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
            "html": html_content
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
    bedrijfsnaam = get_email_brand_name(instellingen)
    sender_email = os.environ.get("SENDER_EMAIL") or instellingen.get("email") or COMPANY_EMAIL
    return sender_email if "<" in sender_email else f"{bedrijfsnaam} <{sender_email}>"


def get_email_brand_name(instellingen: dict) -> str:
    bedrijfsnaam = (instellingen.get("bedrijfsnaam") or "Smart-Tech BV").strip()
    lowered = bedrijfsnaam.lower()
    if lowered.endswith(" test"):
        return bedrijfsnaam[:-5].strip()
    return bedrijfsnaam


def get_company_recipient(instellingen: dict) -> str:
    """Get the company email for werkbon receipts - prefer inkomend_werkbon, fallback to ts@smart-techbv.be"""
    emails = instellingen.get("emails")
    if emails and isinstance(emails, dict):
        # Prefer inkomend_werkbon for werkbon notifications
        werkbon_email = emails.get("inkomend_werkbon")
        if werkbon_email:
            return werkbon_email
    # Fallback to werkbon recipient email (ts@smart-techbv.be)
    return instellingen.get("inkomend_werkbon") or WERKBON_RECIPIENT_EMAIL


def get_unique_recipients(*emails: Optional[str]) -> List[str]:
    recipients: List[str] = []
    for email in emails:
        normalized = (email or "").strip().lower()
        if normalized and normalized not in recipients:
            recipients.append(normalized)
    return recipients


def format_number(value: float) -> str:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return "-"

    if numeric == 0:
        return "-"
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:.2f}".rstrip("0").rstrip(".")


# ==================== HELPER: SAFE NUMERIC VALUE EXTRACTION ====================

# Afkortingen that should NOT be counted as hours
AFKORTINGEN = ['Z', 'V', 'OV', 'BV', 'F', 'ADV']

def is_afkorting(value) -> bool:
    """Check if a value is an afkorting (sick/leave code) rather than a number"""
    if isinstance(value, str):
        return value.strip().upper() in AFKORTINGEN
    return False

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
    """Return hours for PDF - afkortingen are internal only, show hours or blank"""
    val = regel.get(dag, 0)
    # Skip afkortingen - they should not appear in PDF
    if is_afkorting(val):
        return ""
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
        topMargin=6 * mm,
        bottomMargin=6 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=10, textColor=colors.HexColor("#1a1a2e"), spaceAfter=2, spaceBefore=1))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=8, leading=10))
    styles.add(ParagraphStyle(name="FooterText", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="WeekHeader", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#1a1a2e"), fontName="Helvetica-Bold", alignment=2))

    story = []

    # ── TIMESHEET TITLE BAR ──
    timesheet_table = Table(
        [[Paragraph("TIMESHEET", ParagraphStyle(
            "TSTitle", fontName="Helvetica-Bold", fontSize=15,
            textColor=colors.white, alignment=1, spaceAfter=0, spaceBefore=0,
        ))]],
        colWidths=[271 * mm],
    )
    timesheet_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1a1a2e")),
        ("BOX", (0, 0), (-1, -1), 2, colors.HexColor("#F5A623")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(timesheet_table)
    story.append(Spacer(1, 3))

    # ── MAIN HEADER: [Logo + Week/Jaar/Werkbon Nr | Smart-Tech BV + Company Info] ──
    logo_bytes = decode_base64_data(instellingen.get("logo_base64"))
    # Slightly shorter logo (25mm wide x 20mm tall)
    logo = make_safe_reportlab_image(logo_bytes, 34 * mm, 24 * mm)
    left_cell: list = []
    if logo:
        left_cell.append(logo)
        left_cell.append(Spacer(1, 3))
    week_style = ParagraphStyle("WeekLeft", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#1a1a2e"))
    werkbon_nr_style = ParagraphStyle("WerkbonNr", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#555555"))
    
    # Use current year dynamically
    current_year = datetime.now().year
    werkbon_jaar = werkbon.get('jaar', current_year)
    
    # Generate werkbon number: YYYY-WW-XXX format (year-week-sequence)
    werkbon_id = werkbon.get('id', werkbon.get('_id', ''))
    werkbon_week = werkbon.get('week_nummer', '00')
    # Use last 4 chars of ID as sequence, or generate from created_at
    if werkbon_id:
        seq_num = str(werkbon_id)[-4:].upper()
    else:
        seq_num = str(hash(str(werkbon.get('created_at', ''))))[-4:]
    werkbon_nummer = f"{werkbon_jaar}-W{werkbon_week:0>2}-{seq_num}"
    
    left_cell.append(Paragraph(f"<b>Week {werkbon.get('week_nummer', '-')}</b>", week_style))
    left_cell.append(Paragraph(f"<b>{werkbon_jaar}</b>", week_style))
    left_cell.append(Spacer(1, 2))
    left_cell.append(Paragraph(f"Werkbon nr: {werkbon_nummer}", werkbon_nr_style))

    bedrijfsnaam_pdf = instellingen.get("bedrijfsnaam", "Smart-Tech BV")
    company_name_style = ParagraphStyle("CompNameBold", fontName="Helvetica-Bold", fontSize=13,
                                        textColor=colors.HexColor("#1a1a2e"), spaceAfter=3)
    company_detail_style = ParagraphStyle("CompDetailSmall", fontSize=8, leading=10, textColor=colors.HexColor("#333333"))
    company_lines = [
        instellingen.get("adres") or "",
        " ".join(filter(None, [instellingen.get("postcode"), instellingen.get("stad")])).strip(),
        instellingen.get("telefoon") or "",
        instellingen.get("email") or COMPANY_EMAIL,
        f"KvK: {instellingen['kvk_nummer']}" if instellingen.get("kvk_nummer") else "",
        f"BTW: {instellingen['btw_nummer']}" if instellingen.get("btw_nummer") else "",
    ]
    company_detail_text = "<br/>".join(line for line in company_lines if line)
    right_cell: list = [
        Paragraph(f"<b>{bedrijfsnaam_pdf}</b>", company_name_style),
        Paragraph(company_detail_text or "-", company_detail_style),
    ]

    header_table = Table([[left_cell, right_cell]], colWidths=[80 * mm, 191 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#F5A623")),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor("#F5A623")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#fff8ee")),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 3))

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
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))

    story.append(Table([[left_table, right_table]], colWidths=[125 * mm, 135 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(Spacer(1, 4))

    # ── UREN TABEL (geen afkortingen) ──
    story.append(Paragraph("Gewerkte uren", styles["SectionTitle"]))
    hours_header = [["Werknemer"] + [f"{label}\n{werkbon.get(date_key, '')}" for _, label, date_key, _ in DAY_COLUMNS] + ["Totaal"]]
    hours_rows = []
    for regel in werkbon.get("uren", []):
        totaal = sum(float(regel.get(dag, 0) or 0) for dag, _, _, _ in DAY_COLUMNS)
        hours_rows.append(
            [regel.get("teamlid_naam", "-")]
            + [get_hours_pdf(regel, dag) for dag, _, _, _ in DAY_COLUMNS]
            + [format_number(totaal) if totaal else ""]
        )

    dag_totalen = [
        format_number(s) if (s := sum(float(r.get(dag, 0) or 0) for r in werkbon.get("uren", []))) else ""
        for dag, _, _, _ in DAY_COLUMNS
    ]
    hours_rows.append(["TOTAAL"] + dag_totalen + [format_number(total_uren)])
    hours_table = Table(hours_header + hours_rows, colWidths=[58 * mm] + [22 * mm] * 7 + [22 * mm])
    hours_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F5A623")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(hours_table)

    # ── KM ──
    km_total = sum(float(werkbon.get("km_afstand", {}).get(dag, 0) or 0) for dag, _, _, _ in DAY_COLUMNS)
    if km_total > 0:
        story.append(Spacer(1, 6))
        story.append(Paragraph("KM-afstand (heen & terug)", styles["SectionTitle"]))
        km_header = [[label for _, label, _, _ in DAY_COLUMNS] + ["Totaal"]]
        km_row = [[format_number(werkbon.get("km_afstand", {}).get(dag, 0)) for dag, _, _, _ in DAY_COLUMNS] + [format_number(km_total)]]
        km_table = Table(km_header + km_row, colWidths=[22 * mm] * 7 + [22 * mm])
        km_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BACKGROUND", (-1, 1), (-1, 1), colors.HexColor("#F5A623")),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#cccccc")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9d9d9")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(km_table)

    # ── WERKEN & MATERIALEN (naast elkaar) ──
    has_werken = bool(werkbon.get("uitgevoerde_werken"))
    has_mat = bool(werkbon.get("extra_materialen"))
    if has_werken or has_mat:
        story.append(Spacer(1, 6))
        left_cell = []
        right_cell = []
        if has_werken:
            left_cell.append(Paragraph("<b>Uitgevoerde werken</b>", styles["BodySmall"]))
            left_cell.append(Paragraph(werkbon.get("uitgevoerde_werken", "-").replace("\n", "<br/>"), styles["BodySmall"]))
        if has_mat:
            right_cell.append(Paragraph("<b>Extra materialen</b>", styles["BodySmall"]))
            right_cell.append(Paragraph(werkbon.get("extra_materialen", "-").replace("\n", "<br/>"), styles["BodySmall"]))
        desc_table = Table([[left_cell or [""], right_cell or [""]]], colWidths=[130 * mm, 130 * mm])
        desc_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("LINEBEFORE", (1, 0), (1, 0), 0.5, colors.HexColor("#cccccc")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(desc_table)

    # ── SAMENVATTING + HANDTEKENING (naast elkaar) ──
    story.append(Spacer(1, 4))
    summary_rows = [
        ["Totaal uren", format_number(total_uren)],
        ["Uurtarief", f"€ {klant.get('uurtarief', 0):.2f}"],
    ]
    if klant.get("prijsafspraak"):
        summary_rows.append(["Prijsafspraak", klant.get("prijsafspraak")])
    summary_rows.append(["Totaalbedrag", f"€ {totaal_bedrag:.2f}"])

    summary_table = Table(summary_rows, colWidths=[40 * mm, 55 * mm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fff3cd")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#F5A623")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
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
        sig_content.append(Spacer(1, 3))
        sig_bytes = decode_base64_data(signature_data)
        sig_img = make_safe_reportlab_image(sig_bytes, 70 * mm, 26 * mm)
        
        # Check for selfie - BACKWARD COMPATIBLE: check both field names
        selfie_col: list = []
        selfie_data = werkbon.get("selfie_data") or werkbon.get("selfie")
        if selfie_data:
            selfie_bytes = decode_base64_data(selfie_data)
            selfie_img = make_safe_reportlab_image(selfie_bytes, 24 * mm, 24 * mm)
            if selfie_img:
                selfie_col = [
                    Paragraph("<b>Foto</b>", styles["BodySmall"]),
                    Spacer(1, 2),
                    selfie_img,
                ]

        if sig_img:
            if selfie_col:
                # Side-by-side: signature | selfie photo
                inner_sig_table = Table(
                    [[sig_img, selfie_col]],
                    colWidths=[80 * mm, 30 * mm],
                )
                inner_sig_table.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEAFTER", (0, 0), (0, -1), 0.5, colors.HexColor("#2d3a5f")),
                    ("LEFTPADDING", (1, 0), (1, -1), 6),
                ]))
                sig_content.append(inner_sig_table)
            else:
                sig_content.append(sig_img)
    else:
        sig_content.append(Paragraph("Nog niet ondertekend", styles["BodySmall"]))

    bottom_table = Table([[summary_table, sig_content or [""]]], colWidths=[100 * mm, 160 * mm])
    bottom_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(bottom_table)

    story.append(Spacer(1, 8))
    # Use custom footer from settings, or fall back to default LEGAL_TEXT
    footer_text = instellingen.get("pdf_voettekst") or LEGAL_TEXT
    story.append(Paragraph(footer_text.replace("\n", "<br/>"), styles["FooterText"]))

    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_pdf_filename(werkbon)


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

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="OVSection", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#1a1a2e"), spaceAfter=5, spaceBefore=4))
    styles.add(ParagraphStyle(name="OVBody", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="OVSmall", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="OVLegal", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#666666"), fontName="Helvetica-Oblique"))

    story = []
    
    # Use hardcoded company info
    logo_bytes = decode_base64_data(COMPANY_INFO.get("logo_base64"))
    logo = make_safe_reportlab_image(logo_bytes, 40 * mm, 17 * mm)
    
    # Professional Header
    company_info_text = f"""<b>{COMPANY_INFO['naam']}</b><br/>
{COMPANY_INFO['adres']}<br/>
{COMPANY_INFO['postcode']} {COMPANY_INFO['stad']}, {COMPANY_INFO['land']}<br/>
BTW: {COMPANY_INFO['btw']}<br/>
{COMPANY_INFO['email']}"""
    
    left_cell = []
    if logo:
        left_cell.append(logo)
        left_cell.append(Spacer(1, 4))
    left_cell.append(Paragraph(company_info_text, ParagraphStyle("CompInfo", fontSize=8, leading=10, textColor=colors.HexColor("#333333"))))
    
    title_style = ParagraphStyle("OVTitle", fontName="Helvetica-Bold", fontSize=18, textColor=colors.HexColor("#1a1a2e"), alignment=2)
    date_style = ParagraphStyle("OVDate", fontSize=9, textColor=colors.HexColor("#555555"), alignment=2)
    status_color = colors.HexColor("#28a745") if werkbon.get('status') == 'ondertekend' else colors.HexColor("#F5A623")
    
    title_box = [
        Paragraph("<b>OPLEVERING WERKBON</b>", title_style),
        Spacer(1, 8),
        Paragraph(f"Datum: {werkbon.get('datum') or '-'}", date_style),
        Paragraph(f"Status: {(werkbon.get('status') or 'concept').upper()}", ParagraphStyle("OVStatus", fontSize=9, textColor=status_color, alignment=2, fontName="Helvetica-Bold")),
    ]
    
    header_table = Table([[left_cell, title_box]], colWidths=[100 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#F5A623")),
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
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
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

    fotos = werkbon.get("fotos") or []
    if fotos:
        from reportlab.platypus import PageBreak as PBrk
        story.append(Paragraph("Werkfoto's", styles["OVSection"]))
        # Build 2-column grid: 2 photos per row, up to 6 photos (3 rows)
        foto_images = []
        for foto in fotos[:6]:
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

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PSec", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#1a1a2e"), spaceAfter=5, spaceBefore=4))
    styles.add(ParagraphStyle(name="PBody", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="PSmall", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="PLegal", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#666666"), fontName="Helvetica-Oblique"))

    story = []
    
    # Use hardcoded company info
    logo_bytes = decode_base64_data(COMPANY_INFO.get("logo_base64"))
    logo = make_safe_reportlab_image(logo_bytes, 40 * mm, 17 * mm)
    
    # Professional Header - Left: Logo + Company Info, Right: Werkbon Type + Date/Status
    company_info_text = f"""<b>{COMPANY_INFO['naam']}</b><br/>
{COMPANY_INFO['adres']}<br/>
{COMPANY_INFO['postcode']} {COMPANY_INFO['stad']}, {COMPANY_INFO['land']}<br/>
BTW: {COMPANY_INFO['btw']}<br/>
{COMPANY_INFO['email']}"""
    
    left_cell: list = []
    if logo:
        left_cell.append(logo)
        left_cell.append(Spacer(1, 4))
    left_cell.append(Paragraph(company_info_text, ParagraphStyle("CompInfo", fontSize=8, leading=10, textColor=colors.HexColor("#333333"))))
    
    # Right side: Werkbon type and info
    title_style = ParagraphStyle("PTitle", fontName="Helvetica-Bold", fontSize=18, textColor=colors.HexColor("#1a1a2e"), alignment=2)
    date_style = ParagraphStyle("PDate", fontSize=9, textColor=colors.HexColor("#555555"), alignment=2)
    status_color = colors.HexColor("#28a745") if werkbon.get('status') == 'ondertekend' else colors.HexColor("#F5A623")
    
    title_box = [
        Paragraph("<b>PRODUCTIE WERKBON</b>", title_style),
        Spacer(1, 8),
        Paragraph(f"Datum: {werkbon.get('datum') or '-'}", date_style),
        Paragraph(f"Status: {(werkbon.get('status') or 'concept').upper()}", ParagraphStyle("PStatus", fontSize=9, textColor=status_color, alignment=2, fontName="Helvetica-Bold")),
    ]
    
    header_table = Table([[left_cell, title_box]], colWidths=[100 * mm, 80 * mm])
    header_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#F5A623")),
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
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF3CD")),
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
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
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
        for i, foto in enumerate(fotos[:4]):
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
    footer_text = f"Digitale productie werkbon - {COMPANY_INFO['naam']} - {COMPANY_INFO['email']}"
    story.append(Paragraph(footer_text, styles["PSmall"]))
    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_productie_pdf_filename(werkbon)


async def send_productie_werkbon_email(werkbon: dict, instellingen: dict, pdf_bytes: bytes, pdf_filename: str, klant_email: Optional[str] = None):
    """Send productie werkbon PDF email. Uses same async pattern as other mail functions."""
    # API key check - same as other mail functions
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping productie email")
        return {"success": False, "error": "Email not configured", "recipients": []}
    
    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen)
    klant_recipient = klant_email or werkbon.get("klant_email_override")
    
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
        pauze_value = int(row.get("pauze_minuten") or 0)
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
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PJSection", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#1a1a2e"), spaceAfter=6, spaceBefore=6))
    styles.add(ParagraphStyle(name="PJBody", parent=styles["BodyText"], fontSize=9, leading=12))
    styles.add(ParagraphStyle(name="PJSmall", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    story = []

    logo = make_safe_reportlab_image(decode_base64_data(instellingen.get("logo_base64")), 26 * mm, 18 * mm)
    bedrijfsnaam = instellingen.get("bedrijfsnaam") or "Smart-Tech BV"
    header_left = [logo, Spacer(1, 3)] if logo else []
    header_left.append(Paragraph(f"<b>{bedrijfsnaam}</b>", ParagraphStyle("PJCompany", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#1a1a2e"))))
    header_left.append(Paragraph(instellingen.get("email") or COMPANY_EMAIL, styles["PJSmall"]))
    header_right = [
        Paragraph("<b>PROJECT WERKBON</b>", ParagraphStyle("PJTitle", fontName="Helvetica-Bold", fontSize=16, textColor=colors.HexColor("#1a1a2e"), alignment=2)),
        Paragraph(f"Status: {(werkbon.get('status') or 'ondertekend').capitalize()}", styles["PJBody"]),
        Paragraph(f"Periode start: {(werkbon.get('dag_regels') or [{}])[0].get('datum', werkbon.get('datum', '-'))}", styles["PJBody"]),
    ]
    header = Table([[header_left, header_right]], colWidths=[90 * mm, 80 * mm])
    header.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#F5A623")),
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
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
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
    feedback_rows.append(["Algemene score", "★" * int(werkbon.get("klant_prestatie_score") or 0) + "☆" * max(0, 3 - int(werkbon.get("klant_prestatie_score") or 0))])
    feedback_table = Table(feedback_rows, colWidths=[120 * mm, 50 * mm])
    feedback_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F5A623")),
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


async def send_project_werkbon_email(werkbon: dict, instellingen: dict, pdf_bytes: bytes, pdf_filename: str, klant_email: Optional[str] = None):
    if not resend.api_key:
        return {"success": False, "error": "Email not configured", "recipients": []}

    company_recipient = get_company_recipient(instellingen)
    klant_recipient = klant_email or werkbon.get("klant_email_override")
    recipients = [company_recipient] if company_recipient else []
    if werkbon.get("verstuur_naar_klant") and klant_recipient:
        recipients = get_unique_recipients(company_recipient, klant_recipient)
    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}

    subject = f"Project Werkbon PDF - {werkbon.get('werf_naam', 'Werf')}"
    html = f"""
    <div style='font-family:Arial,sans-serif;max-width:640px;margin:0 auto;'>
      <div style='background:#1a1a2e;color:#fff;padding:24px;border-bottom:4px solid #F5A623;'>
        <h1 style='margin:0;color:#F5A623;'>{instellingen.get('bedrijfsnaam') or 'Smart-Tech BV'}</h1>
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

@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al geregistreerd")
    
    # Check if this email should be admin
    is_admin_user = await is_admin(user_data.email)
    
    user = User(
        email=user_data.email,
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
    password: str, 
    rol: str = "werknemer", 
    team_id: Optional[str] = None, 
    telefoon: Optional[str] = None, 
    werkbon_types: Optional[str] = None, 
    send_email: bool = False,
    current_user: Dict = Depends(require_roles(["admin", "master_admin"]))
):
    """Register a new worker. Only admin/master_admin can create users."""
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
        wachtwoord_plain=password,
        naam=naam,
        rol=rol,
        team_id=team_id,
        telefoon=telefoon,
        werkbon_types=wbt,
    )
    await db.users.insert_one(user.dict())
    
    email_result = {"success": False, "error": "E-mail verzenden staat uitgeschakeld"}
    if send_email:
        instellingen = await db.instellingen.find_one({"id": "company_settings"}) or {}
        email_result = await send_welcome_email(email, naam, password, instellingen)
    
    return {
        "user": UserResponse(**user.dict()),
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "temp_password": password
    }


@api_router.post("/auth/users/{user_id}/resend-info", response_model=ResendInfoMailResponse)
async def resend_worker_info_email(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    # V1: admin check - admins cannot use this action
    if user.get("rol") == "admin" or user.get("rol") == "master_admin":
        raise HTTPException(status_code=400, detail="Voor admins is deze actie niet beschikbaar")

    # Generate new permanent password
    new_password = generate_temp_password()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": hash_password(new_password), 
            "wachtwoord_plain": new_password,
            "actief": True
        }},
    )

    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    email_result = await send_welcome_email(user["email"], user["naam"], new_password, instellingen)
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0})

    return ResendInfoMailResponse(
        user=UserResponse(**updated_user),
        email_sent=email_result.get("success", False),
        email_error=email_result.get("error"),
        temp_password=new_password,
    )

@api_router.post("/auth/login")
async def login_user(login_data: UserLogin):
    """
    Login endpoint with JWT token and platform access info.
    Returns JWT token for authenticated requests.
    """
    print(f"[LOGIN DEBUG] Email: {login_data.email}")
    user = await db.users.find_one({"email": login_data.email})
    if not user:
        print(f"[LOGIN DEBUG] User not found for: {login_data.email}")
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    print(f"[LOGIN DEBUG] User found: {user.get('naam')}")
    print(f"[LOGIN DEBUG] Has password_hash: {bool(user.get('password_hash'))}")
    print(f"[LOGIN DEBUG] Has wachtwoord_plain: {bool(user.get('wachtwoord_plain'))}")
    
    # Try password_hash first, then fall back to plain text comparison (legacy migration)
    authenticated = False
    if user.get("password_hash"):
        print(f"[LOGIN DEBUG] Input password: {login_data.password}")
        print(f"[LOGIN DEBUG] Stored hash: {user['password_hash']}")
        computed = hash_password(login_data.password)
        print(f"[LOGIN DEBUG] Computed hash: {computed}")
        authenticated = verify_password(login_data.password, user["password_hash"])
        print(f"[LOGIN DEBUG] Password hash verify result: {authenticated}")
    
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
    
    # Update role in database if it was mapped
    if normalized_role != user.get("rol"):
        await db.users.update_one(
            {"id": user["id"]}, 
            {"$set": {"rol": normalized_role}}
        )
        user["rol"] = normalized_role
    
    # Check admin_emails setting for admin role
    is_admin_user = await is_admin(login_data.email)
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
    
    return {
        "user": user_response.dict(),
        "token": token,
        "platform_access": platform,
        "valid_roles": list(VALID_ROLES),
    }

@api_router.get("/auth/users", response_model=List[UserResponse])
async def get_all_users(current_user: Dict = Depends(require_web_access())):
    """Get all users. Only web panel users can access."""
    users = await db.users.find().to_list(1000)
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
    return result

@api_router.put("/auth/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, update_data: UserUpdate):
    """Update user. Role assignment is restricted based on assigner's role."""
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="Geen wijzigingen opgegeven")
    
    # Handle new_password field (replaces wachtwoord_plain)
    if "new_password" in update_dict and update_dict["new_password"]:
        update_dict["password_hash"] = hash_password(update_dict["new_password"])
        update_dict["password_changed_at"] = datetime.utcnow()
        del update_dict["new_password"]
    
    # Normalize role if being updated
    if "rol" in update_dict:
        update_dict["rol"] = normalize_role(update_dict["rol"])
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    updated = await db.users.find_one({"id": user_id})
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
async def change_password(user_id: str, password_data: PasswordChangeRequest):
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
                "password_changed_at": datetime.utcnow(),
                "must_change_password": False,
            },
            "$unset": {"wachtwoord_plain": ""}  # Remove plain password if exists
        }
    )
    
    return {"message": "Wachtwoord succesvol gewijzigd", "success": True}

@api_router.post("/auth/admin-reset-password/{user_id}")
async def admin_reset_password(user_id: str, data: dict):
    """
    Admin endpoint to reset user password.
    Only admins can use this - no current password required.
    """
    new_password = data.get("new_password")
    if not new_password:
        raise HTTPException(status_code=400, detail="Nieuw wachtwoord is verplicht")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Wachtwoord moet minimaal 6 karakters bevatten")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    # Hash the new password
    new_hash = hash_password(new_password)
    
    await db.users.update_one(
        {"id": user_id}, 
        {
            "$set": {
                "password_hash": new_hash,
                "password_changed_at": datetime.utcnow(),
                "wachtwoord_plain": new_password,  # Store plain for admin viewing (temporary)
            }
        }
    )
    
    return {"message": "Wachtwoord succesvol gewijzigd", "success": True, "new_password": new_password}

@api_router.get("/auth/user-password/{user_id}")
async def get_user_password(user_id: str):
    """
    Admin endpoint to get user's plain password (if available).
    Only works if wachtwoord_plain is stored.
    """
    user = await db.users.find_one({"id": user_id})
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
):
    """
    Securely assign a role to a user.
    Validates that the assigner has permission to assign the requested role.
    """
    new_role = role_data.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="Rol is vereist")
    
    # Normalize and validate new role
    normalized_new_role = normalize_role(new_role)
    if normalized_new_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Ongeldige rol: {new_role}")
    
    # Get assigner user
    assigner = await db.users.find_one({"id": assigner_id})
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
    
    # Get target user
    target_user = await db.users.find_one({"id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    # Update role
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"rol": normalized_new_role}}
    )
    
    updated = await db.users.find_one({"id": user_id})
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
async def delete_user(user_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete a user. Only admin/master_admin can delete users."""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    # V1: Protect admin and master_admin from deletion
    if user.get("rol") in ("admin", "master_admin"):
        raise HTTPException(status_code=400, detail="Admin gebruikers kunnen niet worden verwijderd")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    return {"message": "Gebruiker verwijderd"}

@api_router.post("/auth/users/{user_id}/push-token")
async def save_push_token(user_id: str, data: dict):
    """Save push notification token for a user"""
    push_token = data.get("push_token")
    if not push_token:
        raise HTTPException(status_code=400, detail="Push token is vereist")
    
    # Debug logging
    logging.info(f"[PUSH] Saving push token for user {user_id}: {push_token[:30]}...")
    
    result = await db.users.update_one({"id": user_id}, {"$set": {"push_token": push_token}})
    
    logging.info(f"[PUSH] Update result: matched={result.matched_count}, modified={result.modified_count}")
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Gebruiker met id {user_id} niet gevonden")
    
    return {"message": "Push token opgeslagen", "matched": result.matched_count, "modified": result.modified_count}

async def send_push_notifications(user_ids: list, title: str, body: str, data: dict = None):
    """Send push notifications to users via Expo Push Service"""
    import httpx
    try:
        tokens = []
        async for user in db.users.find({"id": {"$in": user_ids}, "push_token": {"$ne": None}}, {"push_token": 1}):
            if user.get("push_token"):
                tokens.append(user["push_token"])
        
        if not tokens:
            return {"sent": 0, "message": "No push tokens found"}
        
        messages = [{"to": t, "sound": "default", "title": title, "body": body, "data": data or {}} for t in tokens]
        
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={"Content-Type": "application/json"}
            )
        return {"sent": len(tokens), "message": "Push notifications sent"}
    except Exception as e:
        logging.error(f"Push notification error: {e}")
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
async def get_teams():
    teams = await db.teams.find({"actief": True}).to_list(1000)
    return [Team(**team) for team in teams]

@api_router.get("/teams/{team_id}", response_model=Team)
async def get_team(team_id: str):
    team = await db.teams.find_one({"id": team_id, "actief": True})
    if not team:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    return Team(**team)

@api_router.post("/teams", response_model=Team)
async def create_team(team_data: TeamCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create a new team. Only admin/master_admin can create teams."""
    team = Team(**team_data.dict())
    await db.teams.insert_one(team.dict())
    return team

@api_router.put("/teams/{team_id}", response_model=Team)
async def update_team(team_id: str, team_data: TeamUpdate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update a team. Only admin/master_admin can update teams."""
    update_dict = {k: v for k, v in team_data.dict().items() if v is not None}
    result = await db.teams.update_one({"id": team_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    updated = await db.teams.find_one({"id": team_id})
    return Team(**updated)

@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete a team. Only admin/master_admin can delete teams."""
    result = await db.teams.update_one({"id": team_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    return {"message": "Team verwijderd"}

# ==================== KLANT ROUTES ====================

@api_router.get("/klanten", response_model=List[dict])
async def get_klanten(include_inactive: bool = Query(False)):
    """Get all klanten with migration to new structure"""
    query = {} if include_inactive else {"actief": {"$ne": False}}
    klanten = await db.klanten.find(query).to_list(1000)
    # Migrate each klant to new structure
    return [migrate_klant_data(klant) for klant in klanten]

@api_router.get("/klanten/{klant_id}")
async def get_klant(klant_id: str):
    """Get single klant by ID"""
    klant = await db.klanten.find_one({"id": klant_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    return migrate_klant_data(klant)

@api_router.post("/klanten", response_model=dict)
async def create_klant(klant_data: KlantCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create new klant with auto-generated klantnummer - Admin/Master Admin only"""
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
    klant_dict["company_id"] = "default_company"
    klant_dict["actief"] = True
    klant_dict["created_at"] = datetime.utcnow()
    
    # Ensure adres_structured exists
    if not klant_dict.get("adres_structured"):
        klant_dict["adres_structured"] = {
            "straat": "", "huisnummer": "", "bus": "",
            "postcode": "", "stad": "", "land": "België"
        }
    
    await db.klanten.insert_one(klant_dict)
    return migrate_klant_data(klant_dict)

@api_router.put("/klanten/{klant_id}", response_model=dict)
async def update_klant(klant_id: str, klant_data: dict, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update klant - accepts full klant object - Admin/Master Admin only"""
    existing = await db.klanten.find_one({"id": klant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    
    # Merge with existing data
    update_dict = {**existing, **klant_data}
    
    # Ensure naam/email stay synced with new fields for backward compat
    if update_dict.get("bedrijfsnaam"):
        update_dict["naam"] = update_dict["bedrijfsnaam"]
    if update_dict.get("algemeen_email"):
        update_dict["email"] = update_dict["algemeen_email"]
    
    update_dict["updated_at"] = datetime.utcnow()
    
    # Remove MongoDB _id if present
    update_dict.pop("_id", None)
    
    await db.klanten.replace_one({"id": klant_id}, update_dict)
    return migrate_klant_data(update_dict)

@api_router.delete("/klanten/{klant_id}")
async def delete_klant(klant_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete (deactivate) klant - Admin/Master Admin only"""
    result = await db.klanten.update_one({"id": klant_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
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
    """Send a welcome email to a client - Admin/Master Admin only"""
    klant = await db.klanten.find_one({"id": klant_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    
    # Use new field with fallback to legacy
    email = klant.get("algemeen_email") or klant.get("email")
    naam = klant.get("bedrijfsnaam") or klant.get("naam")
    
    if not email:
        raise HTTPException(status_code=400, detail="Klant heeft geen e-mailadres")
    
    instellingen = await db.instellingen.find_one({"id": "company_settings"}) or {}
    result = await send_klant_welcome_email(email, naam, instellingen)
    return {"email_sent": result.get("success", False), "error": result.get("error")}

# ==================== WERF ROUTES ====================

@api_router.get("/werven", response_model=List[Werf])
async def get_werven():
    werven = await db.werven.find({"actief": True}).to_list(1000)
    return [Werf(**werf) for werf in werven]

@api_router.get("/werven/klant/{klant_id}", response_model=List[Werf])
async def get_werven_by_klant(klant_id: str):
    werven = await db.werven.find({"klant_id": klant_id, "actief": True}).to_list(1000)
    return [Werf(**werf) for werf in werven]

@api_router.post("/werven", response_model=Werf)
async def create_werf(werf_data: WerfCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create new werf - Admin/Master Admin only"""
    klant = await db.klanten.find_one({"id": werf_data.klant_id, "actief": True})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    werf = Werf(**werf_data.dict())
    await db.werven.insert_one(werf.dict())
    return werf

@api_router.put("/werven/{werf_id}", response_model=Werf)
async def update_werf(werf_id: str, werf_data: WerfCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update werf - Admin/Master Admin only"""
    result = await db.werven.update_one({"id": werf_id}, {"$set": werf_data.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    updated = await db.werven.find_one({"id": werf_id})
    return Werf(**updated)

@api_router.delete("/werven/{werf_id}")
async def delete_werf(werf_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete (deactivate) werf - Admin/Master Admin only"""
    result = await db.werven.update_one({"id": werf_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    return {"message": "Werf verwijderd"}

# ==================== WERKBON ROUTES ====================

@api_router.get("/werkbonnen", response_model=List[Werkbon])
async def get_werkbonnen(user_id: str, is_admin: bool = Query(False)):
    if is_admin:
        # Admin can see all werkbonnen
        # Exclude large binary fields to reduce memory usage during sort
        projection = {
            "_id": 0,
            "selfie_data": 0,
            "selfie": 0,
            "handtekening_data": 0,
            "handtekening": 0,
            "foto_data": 0
        }
        # Use find with projection to exclude large fields, then sort
        cursor = db.werkbonnen.find({}, projection).sort("created_at", -1).limit(500)
        werkbonnen = await cursor.to_list(500)
        return [Werkbon(**wb) for wb in werkbonnen]
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    # V1: Use has_web_access for admin check instead of hardcoded list
    query = {} if has_web_access(user.get("rol", "")) else {"ingevuld_door_id": user_id}
    projection = {
        "_id": 0,
        "selfie_data": 0,
        "selfie": 0,
        "handtekening_data": 0,
        "handtekening": 0,
        "foto_data": 0
    }
    cursor = db.werkbonnen.find(query, projection).sort("created_at", -1).limit(500)
    werkbonnen = await cursor.to_list(500)
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/user/{user_id}", response_model=List[Werkbon])
async def get_werkbonnen_by_user(user_id: str):
    projection = {
        "_id": 0,
        "selfie_data": 0,
        "selfie": 0,
        "handtekening_data": 0,
        "handtekening": 0,
        "foto_data": 0
    }
    cursor = db.werkbonnen.find({"ingevuld_door_id": user_id}, projection).sort("created_at", -1).limit(500)
    werkbonnen = await cursor.to_list(500)
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/{werkbon_id}", response_model=Werkbon)
async def get_werkbon(werkbon_id: str, response: Response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id})
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
    werkbon_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    # Base document
    base_doc = {
        "id": werkbon_id,
        "company_id": "default_company",
        "type": werkbon_type,
        "klant_id": data.klant_id,
        "klant_naam": data.klant_naam or "",
        "werf_id": data.werf_id,
        "werf_naam": data.werf_naam or "",
        "datum": data.datum or now.strftime("%Y-%m-%d"),
        "opmerkingen": data.opmerkingen or "",
        "handtekening": data.handtekening,
        "handtekening_data": data.handtekening,  # Also save as handtekening_data for PDF generation
        "handtekening_naam": data.handtekening_naam or "",
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
    
    # Process photos
    if data.fotos:
        base_doc["fotos"] = [f.get("data") or f.get("uri") for f in data.fotos if f]
    
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
            "km_afstand": data.km_afstand if isinstance(data.km_afstand, dict) else {"afstand": data.km_afstand, "beschrijving": ""} if data.km_afstand else {"afstand": 0, "beschrijving": ""},
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
    klant = await db.klanten.find_one({"id": werkbon_data.klant_id})
    werf = await db.werven.find_one({"id": werkbon_data.werf_id})
    
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
    await db.werkbonnen.insert_one(werkbon.dict())
    return werkbon

@api_router.put("/werkbonnen/{werkbon_id}", response_model=Werkbon)
async def update_werkbon(werkbon_id: str, update_data: WerkbonUpdate):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    # Resolve klant name if klant_id was provided
    if update_data.klant_id and not update_data.klant_naam:
        klant = await db.klanten.find_one({"id": update_data.klant_id})
        if klant:
            update_dict["klant_naam"] = klant["naam"]
    
    # Resolve werf name if werf_id was provided
    if update_data.werf_id and not update_data.werf_naam:
        werf = await db.werven.find_one({"id": update_data.werf_id})
        if werf:
            update_dict["werf_naam"] = werf["naam"]
    
    # Recalculate week dates if week/year changed
    existing = await db.werkbonnen.find_one({"id": werkbon_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    new_week = update_data.week_nummer or existing.get("week_nummer")
    new_jaar = update_data.jaar or existing.get("jaar")
    if update_data.week_nummer or update_data.jaar:
        week_dates = get_week_dates(new_jaar, new_week)
        update_dict.update(week_dates)
    
    if update_data.handtekening_data:
        update_dict["handtekening_datum"] = datetime.utcnow()
        update_dict["status"] = "ondertekend"
    
    if "uren" in update_dict:
        update_dict["uren"] = [uur.dict() if hasattr(uur, 'dict') else uur for uur in update_dict["uren"]]
    
    if "km_afstand" in update_dict and hasattr(update_dict["km_afstand"], 'dict'):
        update_dict["km_afstand"] = update_dict["km_afstand"].dict()
    
    result = await db.werkbonnen.update_one({"id": werkbon_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    updated = await db.werkbonnen.find_one({"id": werkbon_id})
    return Werkbon(**updated)

@api_router.delete("/werkbonnen/{werkbon_id}")
async def delete_werkbon(werkbon_id: str):
    result = await db.werkbonnen.delete_one({"id": werkbon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    return {"message": "Werkbon verwijderd"}

@api_router.post("/werkbonnen/{werkbon_id}/dupliceer", response_model=Werkbon)
async def dupliceer_werkbon(werkbon_id: str, current_user: Dict = Depends(get_current_user)):
    """Create a copy of an existing werkbon with current week number - uses authenticated user's identity from JWT"""
    original = await db.werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

    # Use authenticated user's identity from JWT
    user_id = current_user["user_id"]
    user_naam = current_user["naam"]

    now = datetime.utcnow()
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
    await db.werkbonnen.insert_one(new_werkbon.dict())
    return new_werkbon

# ==================== BEDRIJFSINSTELLINGEN ROUTES ====================

@api_router.get("/instellingen")
async def get_instellingen(current_user: Dict = Depends(require_web_access())):
    """Get company settings. Web panel users can read."""
    settings = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0})
    if not settings:
        default = BedrijfsInstellingen()
        default_dict = default.dict()
        await db.instellingen.insert_one(default_dict.copy())
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

    return settings

@api_router.put("/instellingen")
async def update_instellingen(update_data: BedrijfsInstellingenUpdate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Update company settings. Only admin/master_admin can modify."""
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}

    # Normalize field names: frontend sends adres_structured / pdf_texts
    if 'adres_structured' in update_dict:
        update_dict['adres_gestructureerd'] = update_dict.pop('adres_structured')
    if 'pdf_texts' in update_dict:
        update_dict['pdf_teksten'] = update_dict.pop('pdf_texts')

    await db.instellingen.update_one(
        {"id": "company_settings"},
        {"$set": update_dict},
        upsert=True
    )

    updated = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0})
    if updated.get('adres_gestructureerd') and not updated.get('adres_structured'):
        updated['adres_structured'] = updated['adres_gestructureerd']
    if updated.get('pdf_teksten') and not updated.get('pdf_texts'):
        updated['pdf_texts'] = updated['pdf_teksten']
    return updated

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
):
    """Send werkbon PDF email. By default only to company. If klant_email provided, also to that address."""
    
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping email")
        return {"success": False, "error": "Email not configured"}
    
    week = werkbon.get("week_nummer", "?")
    year = werkbon.get("jaar", "?")
    werf_naam = werkbon.get("werf_naam", "Onbekend")
    klant_naam = werkbon.get("klant_naam", "Onbekend")
    ondertekend_door = werkbon.get("handtekening_naam", "Onbekend")
    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen)
    
    # Default: only company email. Add client email only when explicitly provided.
    if klant_email and klant_email.strip():
        recipients = get_unique_recipients(company_recipient, klant_email.strip())
    else:
        recipients = [company_recipient] if company_recipient else []

    if not recipients:
        return {"success": False, "error": "Geen ontvangers geconfigureerd", "recipients": []}
    
    klant_btw = klant.get("btw_nummer", "")
    klant_btw_row = f"<tr><td>BTW Nr. Klant</td><td>{klant_btw}</td></tr>" if klant_btw else ""
    
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
                    <td><strong>{total_uren} uur</strong></td>
                </tr>
                <tr>
                    <td>Uurtarief</td>
                    <td>€{klant.get('uurtarief', 0):.2f}</td>
                </tr>
                {klant_btw_row}
                <tr class="total-row">
                    <td>Totaal bedrag</td>
                    <td>€{totaal_bedrag:.2f}</td>
                </tr>
            </table>

            <div class="disclaimer">
                <strong>Belangrijk:</strong> Gelieve uw opmerkingen binnen 5 werkdagen door te sturen naar <a href="mailto:{get_company_recipient(instellingen)}">{get_company_recipient(instellingen)}</a>.<br/>
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
):
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping oplevering email")
        return {"success": False, "error": "Email not configured", "recipients": []}

    bedrijfsnaam = get_email_brand_name(instellingen)
    company_recipient = get_company_recipient(instellingen)
    klant_recipient = klant_email or werkbon.get("klant_email_override") or werkbon.get("klant_email")

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
async def verzend_werkbon(werkbon_id: str, klant_email: Optional[str] = Query(None)):
    """Generate signed werkbon PDF and email it. By default only to company. Provide klant_email to also send to client."""
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    if werkbon.get("status") != "ondertekend":
        raise HTTPException(status_code=400, detail="Werkbon moet eerst ondertekend worden")
    
    # Get klant for hourly rate
    klant = await db.klanten.find_one({"id": werkbon["klant_id"]}, {"_id": 0})
    uurtarief = klant.get("uurtarief", 0) if klant else 0
    werf = await db.werven.find_one({"id": werkbon["werf_id"]}, {"_id": 0}) or {}
    
    # Get company settings
    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0})
    if not instellingen:
        instellingen = {}
    
    total_uren = calculate_total_uren(werkbon)
    totaal_bedrag = total_uren * uurtarief

    try:
        import gc
        # Force garbage collection before PDF generation to free memory
        gc.collect()
        
        pdf_bytes, pdf_filename = generate_werkbon_pdf(werkbon, klant or {}, werf, instellingen, total_uren, totaal_bedrag)
        
        # Force garbage collection after PDF generation
        gc.collect()
    except Exception as exc:
        logging.exception("PDF generation failed for werkbon %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")
    
    # Send email - klant_email is optional (only if user explicitly provided it)
    email_result = await send_werkbon_email(
        werkbon,
        klant or {},
        instellingen,
        total_uren,
        totaal_bedrag,
        pdf_bytes,
        pdf_filename,
        klant_email=klant_email,
    )
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
        "success": True
    }

@api_router.get("/werkbonnen/{werkbon_id}/pdf")
async def get_werkbon_pdf(werkbon_id: str):
    """Generate and return werkbon PDF as base64 (for download without sending email)"""
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    # Get klant for hourly rate
    klant = await db.klanten.find_one({"id": werkbon["klant_id"]}, {"_id": 0}) or {}
    uurtarief = klant.get("uurtarief", 0)
    werf = await db.werven.find_one({"id": werkbon["werf_id"]}, {"_id": 0}) or {}
    
    # Get company settings
    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    
    total_uren = calculate_total_uren(werkbon)
    totaal_bedrag = total_uren * uurtarief

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
async def get_oplevering_werkbonnen(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    # V1: Web panel users see all, mobile users see only their own
    query = {} if has_web_access(user.get("rol", "")) else {"ingevuld_door_id": user_id}
    items = await db.oplevering_werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/oplevering-werkbonnen/{werkbon_id}")
async def get_oplevering_werkbon(werkbon_id: str):
    item = await db.oplevering_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    return item

@api_router.post("/oplevering-werkbonnen")
async def create_oplevering_werkbon(
    data: OpleveringWerkbonCreate, 
    user_id: Optional[str] = Query(None),
    user_naam: Optional[str] = Query(None),
    current_user: Optional[Dict] = Depends(get_optional_user)
):
    """Create oplevering werkbon - supports both JWT auth and legacy query params"""
    # Use JWT if available, otherwise fall back to query params (legacy support)
    if current_user:
        final_user_id = current_user["user_id"]
        final_user_naam = current_user["naam"]
    elif user_id and user_naam:
        final_user_id = user_id
        final_user_naam = user_naam
    else:
        raise HTTPException(status_code=401, detail="Authenticatie vereist")
    
    validate_oplevering_payload(data)
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    # Process photos - store in GridFS and keep only file_ids
    processed_fotos = []
    for i, foto in enumerate(data.fotos or []):
        try:
            base64_data = foto if isinstance(foto, str) else ""
            if base64_data and len(base64_data) > 100:  # Has actual image data
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
        "company_id": "default_company",
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    await db.oplevering_werkbonnen.insert_one(werkbon_dict)
    return serialize_mongo_doc(werkbon_dict)

@api_router.put("/oplevering-werkbonnen/{werkbon_id}")
async def update_oplevering_werkbon(werkbon_id: str, update_data: OpleveringWerkbonUpdate):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    if update_data.handtekening_klant:
        update_dict["handtekening_datum"] = datetime.utcnow()
        update_dict["status"] = "ondertekend"
    
    # Convert nested models to dicts
    if "schade_checks" in update_dict:
        update_dict["schade_checks"] = [c.dict() if hasattr(c, 'dict') else c for c in update_dict["schade_checks"]]
    if "beoordelingen" in update_dict:
        update_dict["beoordelingen"] = [b.dict() if hasattr(b, 'dict') else b for b in update_dict["beoordelingen"]]
    
    result = await db.oplevering_werkbonnen.update_one({"id": werkbon_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    updated = await db.oplevering_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    return updated


@api_router.post("/oplevering-werkbonnen/{werkbon_id}/verzenden")
async def verzend_oplevering_werkbon(werkbon_id: str, klant_email: Optional[str] = Query(None)):
    werkbon = await db.oplevering_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")

    if not werkbon.get("handtekening_klant") or not werkbon.get("handtekening_klant_naam"):
        raise HTTPException(status_code=400, detail="Oplevering werkbon moet eerst door de klant ondertekend worden")

    if werkbon.get("schade_status") == "schade_aanwezig" and not werkbon.get("fotos"):
        raise HTTPException(status_code=400, detail="Bij schade is minimaal 1 foto verplicht")

    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)

    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}

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
async def delete_oplevering_werkbon(werkbon_id: str):
    result = await db.oplevering_werkbonnen.delete_one({"id": werkbon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    return {"message": "Oplevering werkbon verwijderd"}

# ==================== PROJECT WERKBON ROUTES ====================

@api_router.get("/project-werkbonnen")
async def get_project_werkbonnen(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    # V1: Web panel users see all, mobile users see only their own
    query = {} if has_web_access(user.get("rol", "")) else {"ingevuld_door_id": user_id}
    items = await db.project_werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/project-werkbonnen/{werkbon_id}")
async def get_project_werkbon(werkbon_id: str):
    item = await db.project_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    return item

@api_router.post("/project-werkbonnen")
async def create_project_werkbon(
    data: ProjectWerkbonCreate, 
    user_id: Optional[str] = Query(None),
    user_naam: Optional[str] = Query(None),
    current_user: Optional[Dict] = Depends(get_optional_user)
):
    """Create project werkbon - supports both JWT auth and legacy query params"""
    # Use JWT if available, otherwise fall back to query params (legacy support)
    if current_user:
        final_user_id = current_user["user_id"]
        final_user_naam = current_user["naam"]
    elif user_id and user_naam:
        final_user_id = user_id
        final_user_naam = user_naam
    else:
        raise HTTPException(status_code=401, detail="Authenticatie vereist")
    
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
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
        "company_id": "default_company",
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    await db.project_werkbonnen.insert_one(werkbon_dict)
    return serialize_mongo_doc(werkbon_dict)

@api_router.put("/project-werkbonnen/{werkbon_id}")
async def update_project_werkbon(werkbon_id: str, update_data: ProjectWerkbonUpdate):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    if update_data.handtekening_klant:
        update_dict["handtekening_datum"] = datetime.utcnow()
        update_dict["status"] = "ondertekend"
    
    # Recalculate hours if times changed
    existing = await db.project_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
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
    
    result = await db.project_werkbonnen.update_one({"id": werkbon_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    updated = await db.project_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    return updated


@api_router.post("/project-werkbonnen/{werkbon_id}/verzenden")
async def verzend_project_werkbon(werkbon_id: str, klant_email: Optional[str] = Query(None)):
    werkbon = await db.project_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    if not werkbon.get("handtekening_klant") or not werkbon.get("handtekening_klant_naam"):
        raise HTTPException(status_code=400, detail="Project werkbon moet eerst ondertekend worden")

    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)

    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    
    import gc
    gc.collect()  # Free memory before PDF generation
    pdf_bytes, pdf_filename = generate_project_werkbon_pdf(werkbon_prepared, instellingen)
    gc.collect()  # Free memory after PDF generation
    
    override_email = (klant_email or werkbon.get("klant_email_override") or "").strip()
    email_result = await send_project_werkbon_email(werkbon, instellingen, pdf_bytes, pdf_filename, klant_email=override_email)

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
async def delete_project_werkbon(werkbon_id: str):
    result = await db.project_werkbonnen.delete_one({"id": werkbon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    return {"message": "Project werkbon verwijderd"}

# ==================== PRODUCTIE WERKBON ROUTES ====================

@api_router.get("/productie-werkbonnen")
async def get_productie_werkbonnen(user_id: str, is_admin: bool = False):
    if is_admin:
        items = await db.productie_werkbonnen.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        return items
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    # V1: Use has_web_access for admin check instead of hardcoded list
    query = {} if has_web_access(user.get("rol", "")) else {"ingevuld_door_id": user_id}
    items = await db.productie_werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/productie-werkbonnen/{werkbon_id}")
async def get_productie_werkbon(werkbon_id: str):
    item = await db.productie_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    return item

@api_router.post("/productie-werkbonnen")
async def create_productie_werkbon(
    data: ProductieWerkbonCreate, 
    user_id: Optional[str] = Query(None),
    user_naam: Optional[str] = Query(None),
    current_user: Optional[Dict] = Depends(get_optional_user)
):
    """Create productie werkbon - supports both JWT auth and legacy query params for backward compatibility"""
    # Use JWT if available, otherwise fall back to query params (legacy support)
    if current_user:
        final_user_id = current_user["user_id"]
        final_user_naam = current_user["naam"]
    elif user_id and user_naam:
        final_user_id = user_id
        final_user_naam = user_naam
    else:
        raise HTTPException(status_code=401, detail="Authenticatie vereist")
    
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")

    # Process photos - store in GridFS and keep only file_ids
    processed_fotos = []
    for i, foto in enumerate(data.fotos or []):
        try:
            base64_data = foto.get("base64", "") if isinstance(foto, dict) else str(foto)
            if base64_data and len(base64_data) > 100:  # Has actual image data
                file_id = await store_base64_to_gridfs(
                    base64_data, 
                    f"productie_foto_{final_user_id}_{i}_{uuid.uuid4().hex[:8]}.jpg",
                    "image/jpeg"
                )
                processed_fotos.append({
                    "file_id": file_id,
                    "timestamp": foto.get("timestamp", "") if isinstance(foto, dict) else "",
                    "werknemer_id": foto.get("werknemer_id", final_user_id) if isinstance(foto, dict) else user_id,
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
        "company_id": "default_company",
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    await db.productie_werkbonnen.insert_one(werkbon_dict)
    return serialize_mongo_doc(werkbon_dict)

@api_router.post("/productie-werkbonnen/{werkbon_id}/verzenden")
async def verzend_productie_werkbon(werkbon_id: str, klant_email: Optional[str] = Query(None)):
    werkbon = await db.productie_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    
    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)
    
    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    try:
        import gc
        gc.collect()  # Free memory before PDF generation
        pdf_bytes, pdf_filename = generate_productie_pdf(werkbon_prepared, instellingen)
        gc.collect()  # Free memory after PDF generation
    except Exception as exc:
        logging.exception("Productie PDF generation failed for %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")

    override_email = (klant_email or werkbon.get("klant_email_override") or "").strip()
    email_result = await send_productie_werkbon_email(werkbon, instellingen, pdf_bytes, pdf_filename, klant_email=override_email)
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
async def get_productie_werkbon_pdf(werkbon_id: str):
    werkbon = await db.productie_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    
    # Prepare werkbon data - resolve GridFS file IDs to base64 for PDF generation
    werkbon_prepared = await prepare_werkbon_for_pdf(werkbon)
    
    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    try:
        pdf_bytes, pdf_filename = generate_productie_pdf(werkbon_prepared, instellingen)
    except Exception as exc:
        logging.exception("Productie PDF generation failed for %s", werkbon_id)
        raise HTTPException(status_code=500, detail=f"PDF genereren mislukt: {str(exc)}")
    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return {"pdf_base64": pdf_base64, "pdf_filename": pdf_filename}

@api_router.delete("/productie-werkbonnen/{werkbon_id}")
async def delete_productie_werkbon(werkbon_id: str):
    result = await db.productie_werkbonnen.delete_one({"id": werkbon_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    return {"message": "Productie werkbon verwijderd"}

# ==================== PLANNING ROUTES ====================

@api_router.get("/planning")
async def get_planning(week_nummer: int, jaar: int):
    items = await db.planning.find({"week_nummer": week_nummer, "jaar": jaar}, {"_id": 0}).sort("dag", 1).to_list(500)
    return items

@api_router.get("/planning/werknemer/{werknemer_id}")
async def get_planning_werknemer(werknemer_id: str, week_nummer: Optional[int] = None, jaar: Optional[int] = None):
    query = {"werknemer_ids": werknemer_id}
    if week_nummer is not None:
        query["week_nummer"] = week_nummer
    if jaar is not None:
        query["jaar"] = jaar
    items = await db.planning.find(query, {"_id": 0}).sort([("jaar", -1), ("week_nummer", -1), ("dag", 1)]).to_list(500)
    return items

@api_router.get("/planning/{planning_id}")
async def get_planning_item(planning_id: str):
    item = await db.planning.find_one({"id": planning_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")
    return item

@api_router.post("/planning")
async def create_planning(data: PlanningItemCreate, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Create planning item - Admin/Master Admin only"""
    # Resolve names
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    # Get worker names if not provided
    werknemer_namen = data.werknemer_namen
    if data.werknemer_ids and not werknemer_namen:
        for wid in data.werknemer_ids:
            user = await db.users.find_one({"id": wid})
            if user:
                werknemer_namen.append(user["naam"])
    
    team_naam = None
    if data.team_id:
        team = await db.teams.find_one({"id": data.team_id})
        if team:
            team_naam = team["naam"]
    
    # Check if worker is already assigned (orange warning)
    waarschuwingen = []
    for wid in data.werknemer_ids:
        existing = await db.planning.find_one({
            "werknemer_ids": wid,
            "week_nummer": data.week_nummer,
            "jaar": data.jaar,
            "dag": data.dag,
        })
        if existing:
            user = await db.users.find_one({"id": wid})
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
    await db.planning.insert_one(item.dict())
    result = item.dict()
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
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    # Resolve names if IDs changed
    if update_data.klant_id:
        klant = await db.klanten.find_one({"id": update_data.klant_id})
        if klant:
            update_dict["klant_naam"] = klant["naam"]
    if update_data.werf_id:
        werf = await db.werven.find_one({"id": update_data.werf_id})
        if werf:
            update_dict["werf_naam"] = werf["naam"]
            update_dict["werf_adres"] = werf.get("adres", "")
    if update_data.werknemer_ids:
        namen = []
        for wid in update_data.werknemer_ids:
            user = await db.users.find_one({"id": wid})
            if user:
                namen.append(user["naam"])
        update_dict["werknemer_namen"] = namen
    
    result = await db.planning.update_one({"id": planning_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")
    updated = await db.planning.find_one({"id": planning_id}, {"_id": 0})
    return updated

@api_router.delete("/planning/{planning_id}")
async def delete_planning(planning_id: str, current_user: Dict = Depends(require_roles(["admin", "master_admin"]))):
    """Delete planning item - Admin/Master Admin only"""
    result = await db.planning.delete_one({"id": planning_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Planning item niet gevonden")
    return {"message": "Planning item verwijderd"}

@api_router.post("/planning/{planning_id}/bevestig")
async def bevestig_planning(planning_id: str, werknemer_id: str, werknemer_naam: Optional[str] = Query(None)):
    """Worker confirms/acknowledges a planning item"""
    item = await db.planning.find_one({"id": planning_id})
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
            {"id": planning_id},
            {"$set": {"bevestigd_door": bevestigd, "bevestigingen": bevestigingen}}
        )
        
        # Send notification to admins
        try:
            admin_users = await db.users.find(
                {"rol": {"$in": ["admin", "master_admin"]}, "push_token": {"$ne": None}},
                {"push_token": 1, "id": 1}
            ).to_list(100)
            
            admin_ids = [a["id"] for a in admin_users if a.get("push_token")]
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
async def get_berichten(user_id: str):
    """Get messages for a user (broadcasts + direct messages)"""
    items = await db.berichten.find(
        {"$or": [{"naar_id": user_id}, {"is_broadcast": True}, {"van_id": user_id}]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/berichten/ongelezen")
async def get_ongelezen_berichten(user_id: str):
    """Get unread message count for a user"""
    count = await db.berichten.count_documents({
        "$or": [{"naar_id": user_id}, {"is_broadcast": True}],
        "gelezen_door": {"$nin": [user_id]}
    })
    return {"ongelezen": count}

@api_router.post("/berichten")
async def create_bericht(data: BerichtCreate, current_user: Dict = Depends(get_current_user)):
    """Create bericht - uses authenticated user's identity from JWT"""
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
        "company_id": "default_company",
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
        "created_at": datetime.utcnow(),
    }
    
    # Resolve recipient name
    if data.naar_id:
        user = await db.users.find_one({"id": data.naar_id})
        if user:
            bericht_dict["naar_naam"] = user["naam"]
    
    await db.berichten.insert_one(bericht_dict)
    
    # Send push notification to recipients
    try:
        notification_recipients = []
        if data.is_broadcast:
            # For broadcasts, send to all active workers
            async for user in db.users.find({"actief": True, "push_token": {"$ne": None}}, {"id": 1}):
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
async def markeer_gelezen(bericht_id: str, user_id: str):
    """Mark a message as read"""
    await db.berichten.update_one(
        {"id": bericht_id},
        {"$addToSet": {"gelezen_door": user_id}}
    )
    return {"message": "Bericht als gelezen gemarkeerd"}

@api_router.delete("/berichten/{bericht_id}")
async def delete_bericht(bericht_id: str):
    result = await db.berichten.delete_one({"id": bericht_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bericht niet gevonden")
    return {"message": "Bericht verwijderd"}

@api_router.patch("/berichten/{bericht_id}")
async def update_bericht(bericht_id: str, data: dict):
    """Update a bericht (archive, pin, etc.)"""
    update_fields = {}
    if "gearchiveerd" in data:
        update_fields["gearchiveerd"] = data["gearchiveerd"]
    if "vastgepind" in data:
        update_fields["vastgepind"] = data["vastgepind"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Geen velden om bij te werken")
    
    result = await db.berichten.update_one(
        {"id": bericht_id},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bericht niet gevonden")
    return {"message": "Bericht bijgewerkt", "updated_fields": list(update_fields.keys())}

@api_router.post("/berichten/send-email")
async def send_bericht_email(data: dict):
    """Send a bericht also via email"""
    try:
        to_email = data.get("to_email")
        onderwerp = data.get("onderwerp", "Nieuw bericht")
        inhoud = data.get("inhoud", "")
        van_naam = data.get("van_naam", "Admin")
        
        if not to_email:
            return {"success": False, "error": "Geen e-mailadres"}
        
        instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
        bedrijfsnaam = instellingen.get("bedrijfsnaam", "Smart-Tech BV")
        
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
        sender_email = os.getenv("SENDER_EMAIL", "info@smart-techbv.be")
        
        if not resend_key:
            return {"success": False, "error": "E-mail service niet geconfigureerd"}
        
        import resend
        resend.api_key = resend_key
        
        result = resend.Emails.send({
            "from": f"{bedrijfsnaam} <{sender_email}>",
            "to": [to_email],
            "subject": f"{bedrijfsnaam} - {onderwerp}",
            "html": html_content,
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
        raise HTTPException(status_code=500, detail=f"Upload mislukt: {str(e)}")

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
        "created_at": datetime.utcnow(),
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

@api_router.get("/app-settings")
async def get_app_settings():
    """Get app theme settings - used by mobile app for remote theming"""
    settings = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0})
    if not settings:
        settings = {}
    return {
        "bedrijfsnaam": settings.get("bedrijfsnaam", "Smart-Tech BV"),
        "logo_base64": settings.get("logo_base64"),
        "primary_color": settings.get("primary_color", "#1a1a2e"),
        "secondary_color": settings.get("secondary_color", "#F5A623"),
        "accent_color": settings.get("accent_color", "#16213e"),
        "pdf_voettekst": settings.get("pdf_voettekst"),
        "uren_confirmation_text": settings.get("uren_confirmation_text"),
        "oplevering_confirmation_text": settings.get("oplevering_confirmation_text"),
        "project_confirmation_text": settings.get("project_confirmation_text"),
    }

# ==================== DASHBOARD STATS ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: Dict = Depends(get_current_user)):
    """Get comprehensive dashboard statistics"""
    now = datetime.utcnow()
    current_week = now.isocalendar()[1]
    current_year = now.isocalendar()[0]
    
    # V1: Count active mobile users (worker, onderaannemer) - excluding web panel roles
    total_werknemers = await db.users.count_documents({"actief": True, "rol": {"$in": ["worker", "onderaannemer"]}})
    total_teams = await db.teams.count_documents({})  # Count all teams, not just actief=True
    total_klanten = await db.klanten.count_documents({})  # Count all klanten
    total_werven = await db.werven.count_documents({})  # Count all werven
    
    # Werkbonnen stats
    werkbonnen_week = await db.werkbonnen.count_documents({"week_nummer": current_week, "jaar": current_year})
    werkbonnen_ondertekend = await db.werkbonnen.count_documents({"status": "ondertekend"})
    werkbonnen_concept = await db.werkbonnen.count_documents({"status": "concept"})
    
    # Oplevering stats
    oplevering_total = await db.oplevering_werkbonnen.count_documents({})
    
    # Project werkbon stats
    project_total = await db.project_werkbonnen.count_documents({})
    
    # Planning stats
    planning_week = await db.planning.count_documents({"week_nummer": current_week, "jaar": current_year})
    planning_afgerond = await db.planning.count_documents({"week_nummer": current_week, "jaar": current_year, "status": "afgerond"})
    
    # Unread messages
    ongelezen_berichten = await db.berichten.count_documents({"gelezen_door": {"$size": 0}})
    
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
        "jaar": current_year,
    }

@api_router.get("/dashboard/uren-maand")
async def get_uren_deze_maand(jaar: int, maand: int):
    """Get total uren for a given month across all werkbonnen."""
    import calendar
    weeks_set = set()
    _, num_days = calendar.monthrange(jaar, maand)
    for day in range(1, num_days + 1):
        d = datetime(jaar, maand, day)
        weeks_set.add(d.isocalendar()[1])
    werkbonnen = await db.werkbonnen.find(
        {"jaar": jaar, "week_nummer": {"$in": list(weeks_set)}},
        {"_id": 0, "uren": 1}
    ).to_list(1000)
    totaal = 0.0
    for wb in werkbonnen:
        for uren_regel in wb.get("uren", []):
            for dag in ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]:
                val = uren_regel.get(dag, 0)
                try:
                    totaal += float(val)
                except (ValueError, TypeError):
                    pass
    return {"totaal_uren": round(totaal, 1), "jaar": jaar, "maand": maand}

@api_router.get("/")
async def root():
    return {"message": "Werkbon API is actief", "version": "2.0.0"}

@api_router.get("/health")
async def api_health_check():
    return {"status": "healthy", "database": "connected"}

app.include_router(api_router)

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
    try:
        DEFAULT_COMPANY_ID = "default_company"
        
        # === CREATE INDEXES for performance ===
        # This prevents "Sort exceeded memory limit" errors
        try:
            await db.werkbonnen.create_index([("created_at", -1)])
            await db.werkbonnen.create_index([("ingevuld_door_id", 1), ("created_at", -1)])
            logging.info("Database indexes created successfully")
        except Exception as idx_err:
            logging.warning(f"Index creation warning (may already exist): {idx_err}")
        
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
# STATIC FILE SERVING FOR WEB PANEL (Railway deployment)
# ══════════════════════════════════════════════════════════════════════════════

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

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
        
        # Try to serve the exact file first
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # For HTML files
        if full_path.endswith(".html"):
            html_path = os.path.join(STATIC_DIR, full_path)
            if os.path.isfile(html_path):
                return FileResponse(html_path)
        
        # Fallback to index.html for SPA routing
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        
        return {"detail": "Not Found"}

# (removed)
