from fastapi import FastAPI, APIRouter, HTTPException, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import base64
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta, timezone
import hashlib
import resend
import requests
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
APP_URL = os.environ.get('APP_URL', 'https://smart-ops-deploy.preview.emergentagent.com').strip()

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
    wachtwoord_plain: str = ""  # Admin can see this
    naam: str
    rol: str = "werknemer"  # werknemer, ploegbaas, onderaannemer, beheerder, admin
    team_id: Optional[str] = None
    telefoon: Optional[str] = None
    actief: bool = True
    werkbon_types: List[str] = Field(default_factory=lambda: ["uren"])
    mag_wachtwoord_wijzigen: bool = False
    push_token: Optional[str] = None
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
    telefoon: Optional[str] = None
    actief: bool
    werkbon_types: List[str] = Field(default_factory=lambda: ["uren"])
    wachtwoord_plain: str = ""
    mag_wachtwoord_wijzigen: bool = False

class UserUpdate(BaseModel):
    naam: Optional[str] = None
    rol: Optional[str] = None
    team_id: Optional[str] = None
    telefoon: Optional[str] = None
    actief: Optional[bool] = None
    werkbon_types: Optional[List[str]] = None
    mag_wachtwoord_wijzigen: Optional[bool] = None
    wachtwoord_plain: Optional[str] = None


class ResendInfoMailResponse(BaseModel):
    user: UserResponse
    email_sent: bool
    email_error: Optional[str] = None
    temp_password: str

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
    prijsafspraak: Optional[str] = None
    btw_nummer: Optional[str] = None
    actief: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class KlantCreate(BaseModel):
    naam: str
    email: str
    telefoon: Optional[str] = None
    adres: Optional[str] = None
    uurtarief: float = 0
    prijsafspraak: Optional[str] = None
    btw_nummer: Optional[str] = None

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
    uren_confirmation_text: Optional[str] = None
    oplevering_confirmation_text: Optional[str] = None
    project_confirmation_text: Optional[str] = None
    selfie_activeren: Optional[bool] = None
    sms_verificatie_activeren: Optional[bool] = None
    automatisch_naar_klant: Optional[bool] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None

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
    klant_id: str
    werf_id: str
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

# ==================== PLANNING SYSTEM ====================

class PlanningItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    week_nummer: int
    jaar: int
    dag: str  # maandag, dinsdag, etc.
    datum: str  # DD-MM-YYYY
    
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
    
    # Details
    omschrijving: str = ""  # Job description
    materiaallijst: List[str] = []  # Required materials
    geschatte_duur: str = ""  # Estimated duration (e.g., "4 uur", "hele dag")
    prioriteit: str = "normaal"  # laag, normaal, hoog, urgent
    
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
    werknemer_ids: List[str] = []
    werknemer_namen: List[str] = []
    team_id: Optional[str] = None
    klant_id: str
    werf_id: str
    omschrijving: str = ""
    materiaallijst: List[str] = []
    geschatte_duur: str = ""
    prioriteit: str = "normaal"
    notities: str = ""

class PlanningItemUpdate(BaseModel):
    dag: Optional[str] = None
    datum: Optional[str] = None
    werknemer_ids: Optional[List[str]] = None
    werknemer_namen: Optional[List[str]] = None
    team_id: Optional[str] = None
    klant_id: Optional[str] = None
    werf_id: Optional[str] = None
    omschrijving: Optional[str] = None
    materiaallijst: Optional[List[str]] = None
    geschatte_duur: Optional[str] = None
    prioriteit: Optional[str] = None
    status: Optional[str] = None
    notities: Optional[str] = None

# ==================== MESSAGES / BERICHTEN ====================

class Bericht(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    van_id: str  # Sender user ID
    van_naam: str
    naar_id: Optional[str] = None  # Recipient user ID (None = all workers)
    naar_naam: Optional[str] = None
    is_broadcast: bool = False  # Send to all workers
    
    onderwerp: str = ""
    inhoud: str = ""
    
    vastgepind: bool = False  # Pinned message
    gelezen_door: List[str] = []  # User IDs who read it
    
    planning_id: Optional[str] = None  # Linked planning item
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BerichtCreate(BaseModel):
    naar_id: Optional[str] = None
    is_broadcast: bool = False
    onderwerp: str = ""
    inhoud: str = ""
    vastgepind: bool = False
    planning_id: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed


def generate_temp_password(length: int = 10) -> str:
    return uuid.uuid4().hex[:length]

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
    return instellingen.get("email") or COMPANY_EMAIL


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


def calculate_total_uren(werkbon: dict) -> float:
    total_uren = 0.0
    for regel in werkbon.get("uren", []):
        for dag, _, _, _ in DAY_COLUMNS:
            total_uren += float(regel.get(dag, 0) or 0)
    return total_uren


def decode_base64_data(data_uri: Optional[str]) -> Optional[bytes]:
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
    if not image_bytes:
        return None

    try:
        source = io.BytesIO(image_bytes)
        with PILImage.open(source) as pil_image:
            pil_image.load()
            # Apply EXIF orientation correction
            pil_image = correct_image_orientation(pil_image)
            normalized = io.BytesIO()
            # Convert to RGB if necessary (for RGBA images)
            if pil_image.mode in ('RGBA', 'LA', 'P'):
                pil_image = pil_image.convert('RGB')
            pil_image.save(normalized, format="PNG")
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
    hours = float(regel.get(dag, 0) or 0)
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

    # ── MAIN HEADER: [Logo + Week/Jaar | Smart-Tech BV + Company Info] ──
    logo_bytes = decode_base64_data(instellingen.get("logo_base64"))
    # Slightly shorter logo (25mm wide x 20mm tall)
    logo = make_safe_reportlab_image(logo_bytes, 34 * mm, 24 * mm)
    left_cell: list = []
    if logo:
        left_cell.append(logo)
        left_cell.append(Spacer(1, 3))
    week_style = ParagraphStyle("WeekLeft", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#1a1a2e"))
    left_cell.append(Paragraph(f"<b>Week {werkbon.get('week_nummer', '-')}</b>", week_style))
    left_cell.append(Paragraph(f"<b>{werkbon.get('jaar', '-')}</b>", week_style))

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

    # Signature cell
    sig_content = []
    if werkbon.get("handtekening_data"):
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
        sig_bytes = decode_base64_data(werkbon.get("handtekening_data"))
        sig_img = make_safe_reportlab_image(sig_bytes, 70 * mm, 26 * mm)
        
        # Check for selfie
        selfie_col: list = []
        if werkbon.get("selfie_data"):
            selfie_bytes = decode_base64_data(werkbon.get("selfie_data"))
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
    footer_text = instellingen.get("pdf_voettekst") or "Factuur wordt als goedgekeurd beschouwd indien geen klacht wordt ingediend binnen 1 week."
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

    story = []
    logo_bytes = decode_base64_data(instellingen.get("logo_base64"))
    logo = make_safe_reportlab_image(logo_bytes, 24 * mm, 18 * mm)
    bedrijfsnaam = instellingen.get("bedrijfsnaam") or "Smart-Tech BV"

    left_cell = [logo] if logo else []
    left_cell.append(Spacer(1, 2))
    left_cell.append(Paragraph(f"<b>{bedrijfsnaam}</b>", ParagraphStyle("OVCompany", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#1a1a2e"))))
    left_cell.append(Paragraph(instellingen.get("email") or COMPANY_EMAIL, styles["OVSmall"]))

    title_box = [
        Paragraph("<b>OPLEVERING WERKBON</b>", ParagraphStyle("OVTitle", fontName="Helvetica-Bold", fontSize=16, textColor=colors.HexColor("#1a1a2e"), alignment=2)),
        Paragraph(f"Datum: {werkbon.get('datum') or '-'}", styles["OVBody"]),
        Paragraph(f"Status: {(werkbon.get('status') or 'ondertekend').capitalize()}", styles["OVBody"]),
    ]
    header_table = Table([[left_cell, title_box]], colWidths=[85 * mm, 85 * mm])
    header_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#F5A623")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([header_table, Spacer(1, 8)])

    info_rows = [
        ["Klant", werkbon.get("klant_naam") or "-"],
        ["Klant e-mail", werkbon.get("klant_email_override") or werkbon.get("klant_email") or "-"],
        ["Werf", werkbon.get("werf_naam") or "-"],
        ["Adres", werkbon.get("werf_adres") or "-"],
        ["Installatie", werkbon.get("installatie_type") or "-"],
        ["Monteur", werkbon.get("ingevuld_door_naam") or "-"],
    ]
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
        story.append(Paragraph("Foto's", styles["OVSection"]))
        image_cells = []
        for foto in fotos[:6]:
            image = make_safe_reportlab_image(decode_base64_data(foto), 75 * mm, 55 * mm)
            if image:
                image_cells.append(image)
        if image_cells:
            rows = []
            for index in range(0, len(image_cells), 2):
                pair = image_cells[index:index + 2]
                if len(pair) == 1:
                    pair.append("")
                rows.append(pair)
            images_table = Table(rows, colWidths=[80 * mm, 80 * mm])
            images_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.extend([images_table, Spacer(1, 8)])

    signer_name = werkbon.get("handtekening_klant_naam") or "-"
    signature_bytes = decode_base64_data(werkbon.get("handtekening_klant"))
    signature_image = make_safe_reportlab_image(signature_bytes, 80 * mm, 28 * mm)
    signature_content: list = [Paragraph(f"<b>Klant naam:</b> {signer_name}", styles["OVBody"])]
    if werkbon.get("handtekening_datum"):
        sign_date = werkbon.get("handtekening_datum")
        signature_content.append(Paragraph(f"<b>Ondertekend op:</b> {str(sign_date)[:16]}", styles["OVBody"]))
    signature_content.append(Spacer(1, 4))
    if signature_image:
        signature_content.append(signature_image)

    signature_table = Table([[signature_content]], colWidths=[170 * mm])
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

    story = []
    logo_bytes = decode_base64_data(instellingen.get("logo_base64"))
    logo = make_safe_reportlab_image(logo_bytes, 24 * mm, 18 * mm)
    bedrijfsnaam = instellingen.get("bedrijfsnaam") or "Smart-Tech BV"

    left_cell: list = []
    if logo:
        left_cell.append(logo)
    left_cell.extend([
        Spacer(1, 2),
        Paragraph(f"<b>{bedrijfsnaam}</b>", ParagraphStyle("PComp", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#1a1a2e"))),
        Paragraph(instellingen.get("email") or COMPANY_EMAIL, styles["PSmall"]),
    ])
    title_box = [
        Paragraph("<b>PRODUCTIE WERKBON</b>", ParagraphStyle("PTitle", fontName="Helvetica-Bold", fontSize=16, textColor=colors.HexColor("#1a1a2e"), alignment=2)),
        Paragraph(f"Datum: {werkbon.get('datum') or '-'}", styles["PBody"]),
        Paragraph(f"Status: {(werkbon.get('status') or 'ondertekend').capitalize()}", styles["PBody"]),
    ]
    header_table = Table([[left_cell, title_box]], colWidths=[85 * mm, 85 * mm])
    header_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#F5A623")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([header_table, Spacer(1, 8)])

    # Planning info
    info_rows = [
        ["Monteur", werkbon.get("werknemer_naam") or werkbon.get("ingevuld_door_naam") or "-"],
        ["Klant", werkbon.get("klant_naam") or "-"],
        ["Werf", werkbon.get("werf_naam") or "-"],
        ["Adres", werkbon.get("werf_adres") or "-"],
        ["Start uur", werkbon.get("start_uur") or "-"],
        ["Eind uur", werkbon.get("eind_uur") or "-"],
        ["Voorziene uur", werkbon.get("voorziene_uur") or "-"],
    ]
    if werkbon.get("gps_locatie"):
        info_rows.append(["GPS Locatie", werkbon.get("gps_locatie")])
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

    # Work photos - LARGE, max 2 per page
    fotos = werkbon.get("fotos") or []
    if fotos:
        story.append(Paragraph("Werkfoto's", styles["PSec"]))
        for i, foto in enumerate(fotos[:4]):
            if i > 0 and i % 2 == 0:
                story.append(PageBreak())
                story.append(Paragraph("Werkfoto's (vervolg)", styles["PSec"]))
            base64_data = foto.get("base64") if isinstance(foto, dict) else foto
            foto_ts = foto.get("timestamp", "") if isinstance(foto, dict) else ""
            foto_gps = foto.get("gps", "") if isinstance(foto, dict) else ""
            image = make_safe_reportlab_image(decode_base64_data(base64_data), 160 * mm, 110 * mm)
            if image:
                caption_parts = [f"Foto {i + 1}"]
                if foto_ts:
                    caption_parts.append(foto_ts)
                if foto_gps:
                    caption_parts.append(f"GPS: {foto_gps}")
                story.extend([image, Paragraph(" | ".join(caption_parts), styles["PSmall"]), Spacer(1, 8)])

    # Signature section
    signer_name = werkbon.get("handtekening_naam") or "-"
    sign_date = werkbon.get("handtekening_datum") or "-"
    signature_bytes = decode_base64_data(werkbon.get("handtekening"))
    signature_image = make_safe_reportlab_image(signature_bytes, 80 * mm, 28 * mm)
    sig_content: list = [
        Paragraph(f"<b>Naam:</b> {signer_name}", styles["PBody"]),
        Paragraph(f"<b>Datum:</b> {str(sign_date)[:16]}", styles["PBody"]),
        Spacer(1, 4),
    ]
    if signature_image:
        sig_content.append(signature_image)

    selfie_bytes = decode_base64_data(werkbon.get("selfie_foto"))
    selfie_img = make_safe_reportlab_image(selfie_bytes, 30 * mm, 30 * mm)
    if selfie_img:
        selfie_col: list = [Paragraph("<b>Selfie</b>", styles["PSmall"]), selfie_img]
        sig_table = Table([[sig_content, selfie_col]], colWidths=[130 * mm, 40 * mm])
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
    confirmation_text = instellingen.get("uren_confirmation_text") or "Hierbij bevestigt de klant dat deze ingevulde werkbon juist is ingevuld."
    story.extend([
        Paragraph("Handtekening", styles["PSec"]),
        Paragraph(confirmation_text.replace("\n", "<br/>"), styles["PBody"]),
        Spacer(1, 4),
        sig_table,
        Spacer(1, 8),
    ])
    privacy_text = "Persoonsgegevens worden verwerkt conform de AVG. Foto's en handtekening worden uitsluitend gebruikt voor administratieve doeleinden."
    story.extend([
        Paragraph(f"<i>{privacy_text}</i>", styles["PSmall"]),
        Spacer(1, 4),
        Paragraph((instellingen.get("pdf_voettekst") or "Digitale productie werkbon").replace("\n", "<br/>"), styles["PSmall"]),
    ])
    pdf.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes, build_productie_pdf_filename(werkbon)


async def send_productie_werkbon_email(werkbon: dict, instellingen: dict, pdf_bytes: bytes, pdf_filename: str, klant_email: Optional[str] = None):
    bedrijfsnaam = instellingen.get("bedrijfsnaam") or "Smart-Tech BV"
    company_email = instellingen.get("email") or COMPANY_EMAIL
    admin_emails = instellingen.get("admin_emails") or [COMPANY_EMAIL]
    recipients = list(set([company_email] + admin_emails))
    if klant_email:
        recipients.append(klant_email)
    recipients = [r for r in recipients if r and "@" in r]
    try:
        subject = f"Productie Werkbon - {werkbon.get('werf_naam')} - {werkbon.get('datum')}"
        html_body = f"""
        <h2>Productie Werkbon</h2>
        <p><b>Monteur:</b> {werkbon.get('werknemer_naam') or werkbon.get('ingevuld_door_naam', '-')}</p>
        <p><b>Klant:</b> {werkbon.get('klant_naam', '-')}</p>
        <p><b>Werf:</b> {werkbon.get('werf_naam', '-')}</p>
        <p><b>Datum:</b> {werkbon.get('datum', '-')}</p>
        <p><b>Totaal M&sup2;:</b> {werkbon.get('totaal_m2', 0)} m&sup2;</p>
        <p>De volledige details vindt u in de bijgevoegde PDF.</p>
        <hr><p style="font-size:12px;color:#888">{bedrijfsnaam}</p>
        """
        params = {
            "from": f"{bedrijfsnaam} <{SENDER_EMAIL}>",
            "to": recipients,
            "subject": subject,
            "html": html_body,
            "attachments": [{"filename": pdf_filename, "content": base64.b64encode(pdf_bytes).decode(), "contentType": "application/pdf"}],
        }
        resend.Emails.send(params)
        return {"success": True, "recipients": recipients}
    except Exception as exc:
        logging.error(f"Productie email error: {exc}")
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
    signature_image = make_safe_reportlab_image(decode_base64_data(werkbon.get("handtekening_klant")), 80 * mm, 28 * mm)
    signature_box = [Paragraph(f"<b>Klant naam:</b> {werkbon.get('handtekening_klant_naam') or '-'}", styles["PJBody"])]
    if signature_image:
        signature_box.extend([Spacer(1, 4), signature_image])
    sig_table = Table([[signature_box]], colWidths=[170 * mm])
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
async def register_worker_with_email(email: str, naam: str, password: str, rol: str = "werknemer", team_id: Optional[str] = None, telefoon: Optional[str] = None, werkbon_types: Optional[str] = None):
    """Register a new worker and optionally send welcome email"""
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


@api_router.post("/auth/users/{user_id}/resend-info", response_model=ResendInfoMailResponse)
async def resend_worker_info_email(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    if user.get("rol") == "admin":
        raise HTTPException(status_code=400, detail="Voor beheerders is deze actie niet beschikbaar")

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

@api_router.post("/auth/login", response_model=UserResponse)
async def login_user(login_data: UserLogin):
    user = await db.users.find_one({"email": login_data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Ongeldige inloggegevens")
    
    # Try password_hash first, then fall back to plain text comparison
    authenticated = False
    if user.get("password_hash"):
        authenticated = verify_password(login_data.password, user["password_hash"])
    
    # Fallback: compare with wachtwoord_plain directly
    if not authenticated and user.get("wachtwoord_plain"):
        authenticated = (login_data.password == user["wachtwoord_plain"])
        # If matched via plain text, create the hash for future logins
        if authenticated:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"password_hash": hash_password(login_data.password)}}
            )
    
    if not authenticated:
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
    
    # If admin sets a new password via wachtwoord_plain, also update the hash
    if "wachtwoord_plain" in update_dict and update_dict["wachtwoord_plain"]:
        update_dict["password_hash"] = hash_password(update_dict["wachtwoord_plain"])
    
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

@api_router.post("/auth/users/{user_id}/push-token")
async def save_push_token(user_id: str, data: dict):
    """Save push notification token for a user"""
    push_token = data.get("push_token")
    if not push_token:
        raise HTTPException(status_code=400, detail="Push token is vereist")
    await db.users.update_one({"id": user_id}, {"$set": {"push_token": push_token}})
    return {"message": "Push token opgeslagen"}

async def send_push_notifications(user_ids: list, title: str, body: str, data: dict = None):
    """Send push notifications to users via Expo Push Service"""
    import httpx
    try:
        tokens = []
        async for user in db.users.find({"id": {"$in": user_ids}, "push_token": {"$ne": None}}, {"push_token": 1}):
            if user.get("push_token"):
                tokens.append(user["push_token"])
        
        if not tokens:
            return
        
        messages = [{"to": t, "sound": "default", "title": title, "body": body, "data": data or {}} for t in tokens]
        
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={"Content-Type": "application/json"}
            )
    except Exception as e:
        logging.error(f"Push notification error: {e}")

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

@api_router.post("/klanten/{klant_id}/send-welcome-email")
async def send_klant_welcome(klant_id: str):
    """Send a welcome email to a client"""
    klant = await db.klanten.find_one({"id": klant_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not klant.get("email"):
        raise HTTPException(status_code=400, detail="Klant heeft geen e-mailadres")
    
    instellingen = await db.instellingen.find_one({"id": "company_settings"}) or {}
    result = await send_klant_welcome_email(klant["email"], klant["naam"], instellingen)
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
async def get_werkbonnen(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    query = {} if user.get("rol") == "admin" else {"ingevuld_door_id": user_id}
    werkbonnen = await db.werkbonnen.find(query).sort("created_at", -1).to_list(1000)
    return [Werkbon(**wb) for wb in werkbonnen]

@api_router.get("/werkbonnen/user/{user_id}", response_model=List[Werkbon])
async def get_werkbonnen_by_user(user_id: str):
    werkbonnen = await db.werkbonnen.find({"ingevuld_door_id": user_id}).sort("created_at", -1).to_list(1000)
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
async def dupliceer_werkbon(werkbon_id: str, user_id: str, user_naam: str):
    """Create a copy of an existing werkbon with current week number"""
    original = await db.werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Werkbon niet gevonden")

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
        pdf_bytes, pdf_filename = generate_werkbon_pdf(werkbon, klant or {}, werf, instellingen, total_uren, totaal_bedrag)
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
    query = {} if user.get("rol") == "admin" else {"ingevuld_door_id": user_id}
    items = await db.oplevering_werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/oplevering-werkbonnen/{werkbon_id}")
async def get_oplevering_werkbon(werkbon_id: str):
    item = await db.oplevering_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Oplevering werkbon niet gevonden")
    return item

@api_router.post("/oplevering-werkbonnen")
async def create_oplevering_werkbon(data: OpleveringWerkbonCreate, user_id: str, user_naam: str):
    validate_oplevering_payload(data)
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    werkbon = OpleveringWerkbon(
        klant_id=data.klant_id,
        klant_naam=klant["naam"],
        klant_email=klant.get("email", ""),
        klant_telefoon=klant.get("telefoon", ""),
        werf_id=data.werf_id,
        werf_naam=werf["naam"],
        werf_adres=werf.get("adres", ""),
        datum=data.datum,
        installatie_type=data.installatie_type,
        werk_beschrijving=data.werk_beschrijving,
        gebruikte_materialen=data.gebruikte_materialen,
        extra_opmerkingen=data.extra_opmerkingen,
        schade_status=data.schade_status,
        schade_opmerking=data.schade_opmerking,
        schade_checks=data.schade_checks or [
            SchadeCheck(label="Geen schade", checked=data.schade_status == "geen_schade"),
            SchadeCheck(label="Schade aanwezig", checked=data.schade_status == "schade_aanwezig", opmerking=data.schade_opmerking),
        ],
        alles_ok=data.alles_ok,
        beoordelingen=data.beoordelingen,
        fotos=data.fotos,
        foto_labels=data.foto_labels,
        handtekening_klant=data.handtekening_klant,
        handtekening_klant_naam=data.handtekening_klant_naam,
        handtekening_monteur=data.handtekening_monteur,
        handtekening_monteur_naam=data.handtekening_monteur_naam or user_naam,
        handtekening_datum=datetime.now(timezone.utc),
        verstuur_naar_klant=data.verstuur_naar_klant,
        klant_email_override=(data.klant_email_override or klant.get("email") or "").strip(),
        ingevuld_door_id=user_id,
        ingevuld_door_naam=user_naam,
        status="ondertekend",
    )
    await db.oplevering_werkbonnen.insert_one(werkbon.dict())
    return werkbon.dict()

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

    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}

    try:
        pdf_bytes, pdf_filename = generate_oplevering_pdf(werkbon, instellingen)
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
    query = {} if user.get("rol") == "admin" else {"ingevuld_door_id": user_id}
    items = await db.project_werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/project-werkbonnen/{werkbon_id}")
async def get_project_werkbon(werkbon_id: str):
    item = await db.project_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Project werkbon niet gevonden")
    return item

@api_router.post("/project-werkbonnen")
async def create_project_werkbon(data: ProjectWerkbonCreate, user_id: str, user_naam: str):
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")
    
    dag_regels, totaal = normalize_project_day_rows(data)
    feedback_items = normalize_project_feedback_items(data.klant_feedback_items)
    klant_email = (data.klant_email_override or klant.get("email") or "").strip()
    if not data.handtekening_klant or not data.handtekening_klant_naam.strip():
        raise HTTPException(status_code=400, detail="Klant handtekening en naam zijn verplicht")
    if data.klant_prestatie_score < 1 or data.klant_prestatie_score > 3:
        raise HTTPException(status_code=400, detail="Geef een algemene score van 1 tot 3 sterren")
    if data.verstuur_naar_klant and not klant_email:
        raise HTTPException(status_code=400, detail="Klant e-mail is verplicht wanneer u naar de klant wilt sturen")
    
    werkbon = ProjectWerkbon(
        klant_id=data.klant_id,
        klant_naam=klant["naam"],
        werf_id=data.werf_id,
        werf_naam=werf["naam"],
        werf_adres=werf.get("adres", ""),
        datum=dag_regels[0]["datum"],
        start_tijd=dag_regels[0]["start_tijd"],
        stop_tijd=dag_regels[0]["stop_tijd"],
        pauze_minuten=dag_regels[0]["pauze_minuten"],
        totaal_uren=round(totaal, 2),
        werk_beschrijving=data.werk_beschrijving,
        extra_opmerkingen=data.extra_opmerkingen,
        dag_regels=dag_regels,
        klant_feedback_items=feedback_items,
        klant_feedback_opmerking=data.klant_feedback_opmerking,
        klant_prestatie_score=data.klant_prestatie_score,
        handtekening_klant=data.handtekening_klant,
        handtekening_klant_naam=data.handtekening_klant_naam,
        handtekening_monteur_naam=data.handtekening_monteur_naam or user_naam,
        handtekening_datum=datetime.now(timezone.utc),
        klant_email_override=klant_email,
        verstuur_naar_klant=data.verstuur_naar_klant,
        ingevuld_door_id=user_id,
        ingevuld_door_naam=user_naam,
        status="ondertekend",
    )
    await db.project_werkbonnen.insert_one(werkbon.dict())
    return werkbon.dict()

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

    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    pdf_bytes, pdf_filename = generate_project_werkbon_pdf(werkbon, instellingen)
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
async def get_productie_werkbonnen(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    query = {} if user.get("rol") in ("admin", "beheerder") else {"ingevuld_door_id": user_id}
    items = await db.productie_werkbonnen.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/productie-werkbonnen/{werkbon_id}")
async def get_productie_werkbon(werkbon_id: str):
    item = await db.productie_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    return item

@api_router.post("/productie-werkbonnen")
async def create_productie_werkbon(data: ProductieWerkbonCreate, user_id: str, user_naam: str):
    klant = await db.klanten.find_one({"id": data.klant_id})
    werf = await db.werven.find_one({"id": data.werf_id})
    if not klant:
        raise HTTPException(status_code=404, detail="Klant niet gevonden")
    if not werf:
        raise HTTPException(status_code=404, detail="Werf niet gevonden")

    totaal_m2 = round(float(data.gelijkvloers_m2) + float(data.eerste_verdiep_m2) + float(data.tweede_verdiep_m2), 2)
    werkbon = ProductieWerkbon(
        datum=data.datum,
        werknemer_naam=data.werknemer_naam or user_naam,
        werknemer_id=data.werknemer_id or user_id,
        klant_id=data.klant_id,
        klant_naam=klant["naam"],
        werf_id=data.werf_id,
        werf_naam=werf["naam"],
        werf_adres=werf.get("adres", ""),
        start_uur=data.start_uur,
        eind_uur=data.eind_uur,
        voorziene_uur=data.voorziene_uur,
        uit_te_voeren_werk=data.uit_te_voeren_werk,
        nodige_materiaal=data.nodige_materiaal,
        gelijkvloers_m2=data.gelijkvloers_m2,
        gelijkvloers_cm=data.gelijkvloers_cm,
        eerste_verdiep_m2=data.eerste_verdiep_m2,
        eerste_verdiep_cm=data.eerste_verdiep_cm,
        tweede_verdiep_m2=data.tweede_verdiep_m2,
        tweede_verdiep_cm=data.tweede_verdiep_cm,
        totaal_m2=totaal_m2,
        schuurwerken=data.schuurwerken,
        schuurwerken_m2=data.schuurwerken_m2,
        stofzuigen=data.stofzuigen,
        stofzuigen_m2=data.stofzuigen_m2,
        fotos=data.fotos,
        opmerking=data.opmerking,
        gps_locatie=data.gps_locatie,
        handtekening=data.handtekening,
        handtekening_naam=data.handtekening_naam,
        handtekening_datum=data.handtekening_datum,
        selfie_foto=data.selfie_foto,
        verstuur_naar_klant=data.verstuur_naar_klant,
        klant_email_override=(data.klant_email_override or klant.get("email") or "").strip(),
        ingevuld_door_id=user_id,
        ingevuld_door_naam=user_naam,
        status="ondertekend",
    )
    await db.productie_werkbonnen.insert_one(werkbon.dict())
    return werkbon.dict()

@api_router.post("/productie-werkbonnen/{werkbon_id}/verzenden")
async def verzend_productie_werkbon(werkbon_id: str, klant_email: Optional[str] = Query(None)):
    werkbon = await db.productie_werkbonnen.find_one({"id": werkbon_id}, {"_id": 0})
    if not werkbon:
        raise HTTPException(status_code=404, detail="Productie werkbon niet gevonden")
    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    try:
        pdf_bytes, pdf_filename = generate_productie_pdf(werkbon, instellingen)
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
async def create_planning(data: PlanningItemCreate):
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
        geschatte_duur=data.geschatte_duur,
        prioriteit=data.prioriteit,
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
async def update_planning(planning_id: str, update_data: PlanningItemUpdate):
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
async def delete_planning(planning_id: str):
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
async def create_bericht(data: BerichtCreate, van_id: str, van_naam: str):
    bericht = Bericht(
        van_id=van_id,
        van_naam=van_naam,
        naar_id=data.naar_id,
        is_broadcast=data.is_broadcast,
        onderwerp=data.onderwerp,
        inhoud=data.inhoud,
        vastgepind=data.vastgepind,
        planning_id=data.planning_id,
    )
    
    # Resolve recipient name
    if data.naar_id:
        user = await db.users.find_one({"id": data.naar_id})
        if user:
            bericht.naar_naam = user["naam"]
    
    await db.berichten.insert_one(bericht.dict())
    return bericht.dict()

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
async def get_dashboard_stats():
    """Get comprehensive dashboard statistics"""
    now = datetime.utcnow()
    current_week = now.isocalendar()[1]
    current_year = now.isocalendar()[0]
    
    total_werknemers = await db.users.count_documents({"actief": True, "rol": "werknemer"})
    total_teams = await db.teams.count_documents({"actief": True})
    total_klanten = await db.klanten.count_documents({"actief": True})
    total_werven = await db.werven.count_documents({"actief": True})
    
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

@api_router.get("/")
async def root():
    return {"message": "Werkbon API is actief", "version": "2.0.0"}

@api_router.get("/health")
async def api_health_check():
    return {"status": "healthy", "database": "connected"}

# Include the router in the main app
# Temporary download endpoint for GitHub upload
from fastapi.responses import FileResponse
@api_router.get("/download-backend-zip")
async def download_backend_zip():
    zip_path = "/tmp/smart-ts-backend.zip"
    if os.path.exists(zip_path):
        return FileResponse(path=zip_path, filename="smart-ts-backend.zip", media_type="application/zip")
    raise HTTPException(status_code=404, detail="ZIP file not found")

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

@app.on_event("startup")
async def startup_migrate():
    """Migrate old users to add new fields automatically"""
    try:
        # Add missing fields to all users
        await db.users.update_many(
            {"werkbon_types": {"$exists": False}},
            {"$set": {"werkbon_types": ["uren"]}}
        )
        await db.users.update_many(
            {"wachtwoord_plain": {"$exists": False}},
            {"$set": {"wachtwoord_plain": ""}}
        )
        await db.users.update_many(
            {"mag_wachtwoord_wijzigen": {"$exists": False}},
            {"$set": {"mag_wachtwoord_wijzigen": False}}
        )
        await db.users.update_many(
            {"telefoon": {"$exists": False}},
            {"$set": {"telefoon": None}}
        )
        logging.info("Database migration completed - all users have new fields")
    except Exception as e:
        logging.error(f"Migration error: {e}")



# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK ENDPOINT (for Railway/Docker deployment)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def app_health_check():
    """Health check endpoint for deployment platforms."""
    try:
        # Test database connection
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# (removed)
