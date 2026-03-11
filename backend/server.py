from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
import hashlib
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Resend configuration
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
COMPANY_EMAIL = "info@smart-techbv.be"  # All werkbon notifications go here

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'werkbon_db')]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

# User Model (Workers/Employees)
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    password_hash: str
    naam: str
    rol: str = "werknemer"  # werknemer, admin
    team_id: Optional[str] = None  # Assigned team
    actief: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: str
    password: str
    naam: str
    rol: str = "werknemer"

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    naam: str
    rol: str
    team_id: Optional[str] = None
    actief: bool

class UserUpdate(BaseModel):
    naam: Optional[str] = None
    rol: Optional[str] = None
    team_id: Optional[str] = None
    actief: Optional[bool] = None

# Team Model (Ekip)
class Team(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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

# Klant (Customer) Model
class Klant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    naam: str
    email: str
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    uurtarief: float = 0  # Hourly rate
    actief: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class KlantCreate(BaseModel):
    naam: str
    email: str
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    uurtarief: float = 0

# Werf (Worksite) Model
class Werf(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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
    teamlid_naam: str
    maandag: float = 0
    dinsdag: float = 0
    woensdag: float = 0
    donderdag: float = 0
    vrijdag: float = 0
    zaterdag: float = 0
    zondag: float = 0
    # Afkortingen per dag (Z, V, BV, BF of leeg)
    afkorting_ma: str = ""
    afkorting_di: str = ""
    afkorting_wo: str = ""
    afkorting_do: str = ""
    afkorting_vr: str = ""
    afkorting_za: str = ""
    afkorting_zo: str = ""

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
    
    klant_id: str
    klant_naam: str
    werf_id: str
    werf_naam: str
    
    uren: List[UrenRegel]
    km_afstand: KmRegel = Field(default_factory=KmRegel)
    
    # New fields
    uitgevoerde_werken: str = ""  # Work description
    extra_materialen: str = ""  # Extra materials used
    
    handtekening_data: Optional[str] = None
    handtekening_naam: str = ""
    handtekening_datum: Optional[datetime] = None
    
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
    uren: Optional[List[UrenRegel]] = None
    km_afstand: Optional[KmRegel] = None
    uitgevoerde_werken: Optional[str] = None
    extra_materialen: Optional[str] = None
    handtekening_data: Optional[str] = None
    handtekening_naam: Optional[str] = None
    status: Optional[str] = None

# Bedrijfsinstellingen (Company Settings)
class BedrijfsInstellingen(BaseModel):
    id: str = "company_settings"
    bedrijfsnaam: str = "Smart-Tech BV"
    email: str = "info@smart-techbv.be"
    admin_emails: List[str] = ["info@smart-techbv.be"]  # Admin email addresses
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    kvk_nummer: Optional[str] = None
    btw_nummer: Optional[str] = None
    # PDF Settings
    logo_base64: Optional[str] = None  # Company logo for PDF
    pdf_voettekst: str = "Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week."

class BedrijfsInstellingenUpdate(BaseModel):
    bedrijfsnaam: Optional[str] = None
    email: Optional[str] = None
    admin_emails: Optional[List[str]] = None
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    postcode: Optional[str] = None
    stad: Optional[str] = None
    kvk_nummer: Optional[str] = None
    btw_nummer: Optional[str] = None
    logo_base64: Optional[str] = None
    pdf_voettekst: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

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
    """Send welcome email notification to ADMIN (beheerder) about new worker"""
    
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping welcome email")
        return {"success": False, "error": "Email not configured"}
    
    bedrijfsnaam = instellingen.get('bedrijfsnaam', 'Smart-Tech BV')
    
    # Send to ADMIN email, not worker email (Resend free tier limitation)
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
            .forward-box {{ background: #e3f2fd; border: 2px solid #2196f3; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .forward-box h3 {{ color: #1565c0; margin-top: 0; }}
            .steps {{ background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .steps h3 {{ color: #856404; margin-top: 0; }}
            .step {{ margin: 10px 0; padding-left: 20px; }}
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
            
            <div class="forward-box">
                <h3>📧 Doorsturen naar werknemer</h3>
                <p>Stuur deze gegevens door naar <strong>{user_email}</strong> zodat de werknemer kan inloggen.</p>
            </div>
            
            <div class="steps">
                <h3>Instructies voor de werknemer:</h3>
                <div class="step">1. Open de werkbon app</div>
                <div class="step">2. Log in met bovenstaande gegevens</div>
                <div class="step">3. Wachtwoord wijzigen via Profiel (optioneel)</div>
                <div class="step">4. Werkbonnen aanmaken en invullen</div>
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
            "from": SENDER_EMAIL,
            "to": [COMPANY_EMAIL],  # Send to admin, not worker
            "subject": f"Nieuwe Werknemer: {user_naam} - Inloggegevens",
            "html": html_content
        }
        
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Welcome email sent to admin for {user_email}: {result}")
        return {"success": True, "email_id": result.get("id")}
    except Exception as e:
        logging.error(f"Failed to send welcome email: {str(e)}")
        return {"success": False, "error": str(e)}

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
async def register_worker_with_email(email: str, naam: str, password: str, team_id: Optional[str] = None):
    """Register a new worker and optionally send welcome email"""
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al geregistreerd")
    
    user = User(
        email=email,
        password_hash=hash_password(password),
        naam=naam,
        rol="werknemer",
        team_id=team_id
    )
    await db.users.insert_one(user.dict())
    
    # Get company settings for email
    instellingen = await db.instellingen.find_one({"id": "company_settings"})
    if not instellingen:
        instellingen = {}
    
    # Send welcome email
    email_result = await send_welcome_email(email, naam, password, instellingen)
    
    return {
        "user": UserResponse(**user.dict()),
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "temp_password": password
    }

@api_router.post("/auth/login", response_model=UserResponse)
async def login_user(login_data: UserLogin):
    user = await db.users.find_one({"email": login_data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    if not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    if not user.get("actief", True):
        raise HTTPException(status_code=401, detail="Account is gedeactiveerd")
    
    # Update role based on admin_emails setting
    is_admin_user = await is_admin(login_data.email)
    if is_admin_user and user.get("rol") != "admin":
        await db.users.update_one({"id": user["id"]}, {"$set": {"rol": "admin"}})
        user["rol"] = "admin"
    
    return UserResponse(**user)

@api_router.get("/auth/users", response_model=List[UserResponse])
async def get_all_users():
    users = await db.users.find().to_list(1000)
    return [UserResponse(**user) for user in users]

@api_router.put("/auth/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, update_data: UserUpdate):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="Geen wijzigingen opgegeven")
    
    result = await db.users.update_one({"id": user_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    updated = await db.users.find_one({"id": user_id})
    return UserResponse(**updated)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@api_router.post("/auth/change-password")
async def change_password(user_id: str, password_data: PasswordChange):
    """Change user password"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    # Verify current password
    if not verify_password(password_data.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Huidig wachtwoord is onjuist")
    
    # Update password
    new_hash = hash_password(password_data.new_password)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": new_hash}})
    
    return {"message": "Wachtwoord succesvol gewijzigd"}

@api_router.delete("/auth/users/{user_id}")
async def delete_user(user_id: str):
    """Delete a user (werknemer only, not admin)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    if user.get("rol") == "admin":
        raise HTTPException(status_code=400, detail="Admin gebruikers kunnen niet worden verwijderd")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    
    return {"message": "Gebruiker verwijderd"}

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
async def create_team(team_data: TeamCreate):
    team = Team(**team_data.dict())
    await db.teams.insert_one(team.dict())
    return team

@api_router.put("/teams/{team_id}", response_model=Team)
async def update_team(team_id: str, team_data: TeamUpdate):
    update_dict = {k: v for k, v in team_data.dict().items() if v is not None}
    result = await db.teams.update_one({"id": team_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    updated = await db.teams.find_one({"id": team_id})
    return Team(**updated)

@api_router.delete("/teams/{team_id}")
async def delete_team(team_id: str):
    result = await db.teams.update_one({"id": team_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Team niet gevonden")
    return {"message": "Team verwijderd"}

# ==================== KLANT ROUTES ====================

@api_router.get("/klanten", response_model=List[Klant])
async def get_klanten():
    klanten = await db.klanten.find({"actief": True}).to_list(1000)
    return [Klant(**klant) for klant in klanten]

@api_router.post("/klanten", response_model=Klant)
async def create_klant(klant_data: KlantCreate):
    klant = Klant(**klant_data.dict())
    await db.klanten.insert_one(klant.dict())
    return klant

@api_router.put("/klanten/{klant_id}", response_model=Klant)
async def update_klant(klant_id: str, klant_data: KlantCreate):
    result = await db.klanten.update_one({"id": klant_id}, {"$set": klant_data.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    updated = await db.klanten.find_one({"id": klant_id})
    return Klant(**updated)

@api_router.delete("/klanten/{klant_id}")
async def delete_klant(klant_id: str):
    result = await db.klanten.update_one({"id": klant_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    return {"message": "Klant verwijderd"}

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
async def create_werf(werf_data: WerfCreate):
    klant = await db.klanten.find_one({"id": werf_data.klant_id, "actief": True})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    werf = Werf(**werf_data.dict())
    await db.werven.insert_one(werf.dict())
    return werf

@api_router.put("/werven/{werf_id}", response_model=Werf)
async def update_werf(werf_id: str, werf_data: WerfCreate):
    result = await db.werven.update_one({"id": werf_id}, {"$set": werf_data.dict()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    updated = await db.werven.find_one({"id": werf_id})
    return Werf(**updated)

@api_router.delete("/werven/{werf_id}")
async def delete_werf(werf_id: str):
    result = await db.werven.update_one({"id": werf_id}, {"$set": {"actief": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    return {"message": "Werf verwijderd"}

# ==================== WERKBON ROUTES ====================

@api_router.get("/werkbonnen", response_model=List[Werkbon])
async def get_werkbonnen():
    werkbonnen = await db.werkbonnen.find().sort("created_at", -1).to_list(1000)
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/user/{user_id}", response_model=List[Werkbon])
async def get_werkbonnen_by_user(user_id: str):
    werkbonnen = await db.werkbonnen.find({"ingevuld_door_id": user_id}).sort("created_at", -1).to_list(1000)
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/{werkbon_id}", response_model=Werkbon)
async def get_werkbon(werkbon_id: str):
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    return Werkbon(**werkbon)

@api_router.get("/week-dates/{year}/{week}")
async def get_week_dates_api(year: int, week: int):
    """Get dates for a specific week"""
    return get_week_dates(year, week)

@api_router.post("/werkbonnen", response_model=Werkbon)
async def create_werkbon(werkbon_data: WerkbonCreate, user_id: str, user_naam: str):
    klant = await db.klanten.find_one({"id": werkbon_data.klant_id})
    werf = await db.werven.find_one({"id": werkbon_data.werf_id})
    
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    # Get week dates
    week_dates = get_week_dates(werkbon_data.jaar, werkbon_data.week_nummer)
    
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

# ==================== BEDRIJFSINSTELLINGEN ROUTES ====================

@api_router.get("/instellingen", response_model=BedrijfsInstellingen)
async def get_instellingen():
    settings = await db.instellingen.find_one({"id": "company_settings"})
    if not settings:
        default = BedrijfsInstellingen()
        await db.instellingen.insert_one(default.dict())
        return default
    return BedrijfsInstellingen(**settings)

@api_router.put("/instellingen", response_model=BedrijfsInstellingen)
async def update_instellingen(update_data: BedrijfsInstellingenUpdate):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    
    await db.instellingen.update_one(
        {"id": "company_settings"},
        {"$set": update_dict},
        upsert=True
    )
    
    updated = await db.instellingen.find_one({"id": "company_settings"})
    return BedrijfsInstellingen(**updated)

# ==================== EMAIL SERVICE ====================

async def send_werkbon_email(werkbon: dict, klant: dict, instellingen: dict, total_uren: float, totaal_bedrag: float):
    """Send werkbon notification email to company"""
    
    if not resend.api_key:
        logging.warning("RESEND_API_KEY not configured, skipping email")
        return {"success": False, "error": "Email not configured"}
    
    week = werkbon.get("week_nummer", "?")
    year = werkbon.get("jaar", "?")
    werf_naam = werkbon.get("werf_naam", "Onbekend")
    klant_naam = werkbon.get("klant_naam", "Onbekend")
    ondertekend_door = werkbon.get("handtekening_naam", "Onbekend")
    
    # Build HTML email
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .header {{ background: #F5A623; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; }}
            .info-box {{ background: #f8f9fa; border-left: 4px solid #F5A623; padding: 15px; margin: 15px 0; }}
            .highlight {{ color: #F5A623; font-weight: bold; }}
            table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 10px; text-align: left; }}
            th {{ background: #F5A623; color: white; }}
            .total-row {{ background: #fff3cd; font-weight: bold; }}
            .footer {{ background: #f8f9fa; padding: 15px; font-size: 12px; color: #666; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Werkbon Getekend</h1>
            <p>Week {week} - {year}</p>
        </div>
        
        <div class="content">
            <p>Beste,</p>
            
            <p>Hierbij de werkbon van <span class="highlight">week {week}</span> voor werf <span class="highlight">{werf_naam}</span>.</p>
            
            <div class="info-box">
                <strong>Details:</strong><br/>
                <strong>Klant:</strong> {klant_naam}<br/>
                <strong>Werf:</strong> {werf_naam}<br/>
                <strong>Periode:</strong> Week {week}, {year}<br/>
                <strong>Ondertekend door:</strong> {ondertekend_door}
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
                <tr class="total-row">
                    <td>Totaal bedrag</td>
                    <td>€{totaal_bedrag:.2f}</td>
                </tr>
            </table>
            
            <p>De werkbon is ondertekend door <strong>{ondertekend_door}</strong> namens de klant.</p>
            
            <div class="footer">
                <p><strong>Disclaimer:</strong> {instellingen.get('pdf_voettekst', 'Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week.')}</p>
                <p>Dit is een automatisch gegenereerd bericht van {instellingen.get('bedrijfsnaam', 'Smart-Tech BV')}.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [COMPANY_EMAIL],
            "subject": f"Werkbon Getekend - Week {week} - {werf_naam}",
            "html": html_content
        }
        
        # Run sync SDK in thread to keep FastAPI non-blocking
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Email sent successfully: {result}")
        return {"success": True, "email_id": result.get("id")}
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return {"success": False, "error": str(e)}

@api_router.post("/werkbonnen/{werkbon_id}/verzenden")
async def verzend_werkbon(werkbon_id: str):
    """Send werkbon notification email with cost calculation"""
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    if werkbon.get("status") != "ondertekend":
        raise HTTPException(status_code=400, detail="Werkbon moet eerst ondertekend worden")
    
    # Get klant for hourly rate
    klant = await db.klanten.find_one({"id": werkbon["klant_id"]})
    uurtarief = klant.get("uurtarief", 0) if klant else 0
    
    # Get company settings
    instellingen = await db.instellingen.find_one({"id": "company_settings"})
    if not instellingen:
        instellingen = {}
    
    # Calculate total hours
    total_uren = 0
    for regel in werkbon.get("uren", []):
        total_uren += regel.get("maandag", 0) + regel.get("dinsdag", 0) + regel.get("woensdag", 0)
        total_uren += regel.get("donderdag", 0) + regel.get("vrijdag", 0)
        total_uren += regel.get("zaterdag", 0) + regel.get("zondag", 0)
    
    totaal_bedrag = total_uren * uurtarief
    
    # Send email
    email_result = await send_werkbon_email(werkbon, klant or {}, instellingen, total_uren, totaal_bedrag)
    
    # Update werkbon status
    await db.werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": {
            "status": "verzonden", 
            "email_verzonden": email_result.get("success", False),
            "email_error": email_result.get("error"),
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {
        "message": "Werkbon verzonden" if email_result.get("success") else "Werkbon status bijgewerkt (email niet verzonden)",
        "totaal_uren": total_uren,
        "uurtarief": uurtarief,
        "totaal_bedrag": totaal_bedrag,
        "email_sent": email_result.get("success", False),
        "email_error": email_result.get("error"),
        "success": True
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Werkbon API is actief", "version": "2.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
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
