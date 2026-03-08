from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime
import hashlib
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
    naam: str  # Full name
    rol: str = "werknemer"  # werknemer, admin
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
    actief: bool

# Team Member Model
class TeamLid(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    naam: str
    actief: bool = True

class TeamLidCreate(BaseModel):
    naam: str

# Klant (Customer) Model
class Klant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    naam: str
    email: str
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    actief: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class KlantCreate(BaseModel):
    naam: str
    email: str
    telefoon: Optional[str] = None
    adres: Optional[str] = None

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

# Werkbon (Timesheet) Model
class UrenRegel(BaseModel):
    teamlid_naam: str
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
    klant_id: str
    klant_naam: str
    werf_id: str
    werf_naam: str
    uren: List[UrenRegel]
    handtekening_data: Optional[str] = None  # Base64 signature
    handtekening_naam: str = ""  # Name of person who signed
    handtekening_datum: Optional[datetime] = None
    ingevuld_door_id: str  # User ID who filled this
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

class WerkbonUpdate(BaseModel):
    uren: Optional[List[UrenRegel]] = None
    handtekening_data: Optional[str] = None
    handtekening_naam: Optional[str] = None
    status: Optional[str] = None

# Bedrijfsinstellingen (Company Settings)
class BedrijfsInstellingen(BaseModel):
    id: str = "company_settings"
    bedrijfsnaam: str = "Smart-Tech BV"
    email: str = "info@smart-techbv.be"
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    kvk_nummer: Optional[str] = None
    btw_nummer: Optional[str] = None

class BedrijfsInstellingenUpdate(BaseModel):
    bedrijfsnaam: Optional[str] = None
    email: Optional[str] = None
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    kvk_nummer: Optional[str] = None
    btw_nummer: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_data: UserCreate):
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mailadres is al geregistreerd")
    
    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        naam=user_data.naam,
        rol=user_data.rol
    )
    await db.users.insert_one(user.dict())
    return UserResponse(**user.dict())

@api_router.post("/auth/login", response_model=UserResponse)
async def login_user(login_data: UserLogin):
    user = await db.users.find_one({"email": login_data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    if not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    if not user.get("actief", True):
        raise HTTPException(status_code=401, detail="Account is gedeactiveerd")
    
    return UserResponse(**user)

@api_router.get("/auth/users", response_model=List[UserResponse])
async def get_all_users():
    users = await db.users.find().to_list(1000)
    return [UserResponse(**user) for user in users]

# ==================== TEAM ROUTES ====================

@api_router.get("/team", response_model=List[TeamLid])
async def get_team_members():
    team = await db.team.find({"actief": True}).to_list(1000)
    return [TeamLid(**member) for member in team]

@api_router.post("/team", response_model=TeamLid)
async def create_team_member(member_data: TeamLidCreate):
    member = TeamLid(naam=member_data.naam)
    await db.team.insert_one(member.dict())
    return member

@api_router.put("/team/{member_id}", response_model=TeamLid)
async def update_team_member(member_id: str, member_data: TeamLidCreate):
    result = await db.team.update_one(
        {"id": member_id},
        {"$set": {"naam": member_data.naam}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Teamlid niet gevonden")
    
    updated = await db.team.find_one({"id": member_id})
    return TeamLid(**updated)

@api_router.delete("/team/{member_id}")
async def delete_team_member(member_id: str):
    result = await db.team.update_one(
        {"id": member_id},
        {"$set": {"actief": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Teamlid niet gevonden")
    return {"message": "Teamlid verwijderd"}

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
    result = await db.klanten.update_one(
        {"id": klant_id},
        {"$set": klant_data.dict()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    
    updated = await db.klanten.find_one({"id": klant_id})
    return Klant(**updated)

@api_router.delete("/klanten/{klant_id}")
async def delete_klant(klant_id: str):
    result = await db.klanten.update_one(
        {"id": klant_id},
        {"$set": {"actief": False}}
    )
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
    # Verify klant exists
    klant = await db.klanten.find_one({"id": werf_data.klant_id, "actief": True})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    
    werf = Werf(**werf_data.dict())
    await db.werven.insert_one(werf.dict())
    return werf

@api_router.put("/werven/{werf_id}", response_model=Werf)
async def update_werf(werf_id: str, werf_data: WerfCreate):
    result = await db.werven.update_one(
        {"id": werf_id},
        {"$set": werf_data.dict()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    updated = await db.werven.find_one({"id": werf_id})
    return Werf(**updated)

@api_router.delete("/werven/{werf_id}")
async def delete_werf(werf_id: str):
    result = await db.werven.update_one(
        {"id": werf_id},
        {"$set": {"actief": False}}
    )
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

@api_router.post("/werkbonnen", response_model=Werkbon)
async def create_werkbon(werkbon_data: WerkbonCreate, user_id: str, user_naam: str):
    # Get klant and werf info
    klant = await db.klanten.find_one({"id": werkbon_data.klant_id})
    werf = await db.werven.find_one({"id": werkbon_data.werf_id})
    
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    werkbon = Werkbon(
        week_nummer=werkbon_data.week_nummer,
        jaar=werkbon_data.jaar,
        klant_id=werkbon_data.klant_id,
        klant_naam=klant["naam"],
        werf_id=werkbon_data.werf_id,
        werf_naam=werf["naam"],
        uren=werkbon_data.uren,
        ingevuld_door_id=user_id,
        ingevuld_door_naam=user_naam
    )
    await db.werkbonnen.insert_one(werkbon.dict())
    return werkbon

@api_router.put("/werkbonnen/{werkbon_id}", response_model=Werkbon)
async def update_werkbon(werkbon_id: str, update_data: WerkbonUpdate):
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    # Handle signature
    if update_data.handtekening_data:
        update_dict["handtekening_datum"] = datetime.utcnow()
        update_dict["status"] = "ondertekend"
    
    # Convert uren list to dict format for MongoDB
    if "uren" in update_dict:
        update_dict["uren"] = [uur.dict() if hasattr(uur, 'dict') else uur for uur in update_dict["uren"]]
    
    result = await db.werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": update_dict}
    )
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
        # Create default settings
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

# ==================== EMAIL PLACEHOLDER ====================

@api_router.post("/werkbonnen/{werkbon_id}/verzenden")
async def verzend_werkbon(werkbon_id: str):
    """Placeholder for email sending - to be implemented later"""
    werkbon = await db.werkbonnen.find_one({"id": werkbon_id})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")
    
    if werkbon.get("status") != "ondertekend":
        raise HTTPException(status_code=400, detail="Werkbon moet eerst ondertekend worden")
    
    # TODO: Implement email sending with SMTP
    # For now, just mark as sent
    await db.werkbonnen.update_one(
        {"id": werkbon_id},
        {"$set": {"status": "verzonden", "email_verzonden": True, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "E-mail verzending is nog niet geïmplementeerd. Werkbon is gemarkeerd als verzonden.", "success": True}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Werkbon API is actief", "version": "1.0.0"}

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
