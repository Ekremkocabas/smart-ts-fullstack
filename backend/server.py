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
    # Feature toggles
    selfie_activeren: bool = False
    sms_verificatie_activeren: bool = False
    automatisch_naar_klant: bool = False  # Auto-include client email in werkbon email

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
    selfie_activeren: Optional[bool] = None
    sms_verificatie_activeren: Optional[bool] = None
    automatisch_naar_klant: Optional[bool] = None

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
                <a href="https://timesheet-verify.preview.emergentagent.com" style="background: #F5A623; color: #1a1a2e; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
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


def make_safe_reportlab_image(image_bytes: Optional[bytes], width: float, height: float) -> Optional[Image]:
    if not image_bytes:
        return None

    try:
        source = io.BytesIO(image_bytes)
        with PILImage.open(source) as pil_image:
            pil_image.load()
            normalized = io.BytesIO()
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
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=11, textColor=colors.HexColor("#1a1a2e"), spaceAfter=4, spaceBefore=2))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=8.5, leading=11))
    styles.add(ParagraphStyle(name="FooterText", parent=styles["BodyText"], fontSize=7.5, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="WeekHeader", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#1a1a2e"), fontName="Helvetica-Bold", alignment=2))

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
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(timesheet_table)
    story.append(Spacer(1, 4))

    # ── MAIN HEADER: [Logo + Week/Jaar | Smart-Tech BV + Company Info] ──
    logo_bytes = decode_base64_data(instellingen.get("logo_base64"))
    # Slightly shorter logo (25mm wide x 20mm tall)
    logo = make_safe_reportlab_image(logo_bytes, 25 * mm, 20 * mm)
    left_cell: list = []
    if logo:
        left_cell.append(logo)
        left_cell.append(Spacer(1, 3))
    week_style = ParagraphStyle("WeekLeft", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#1a1a2e"))
    left_cell.append(Paragraph(f"<b>Week {werkbon.get('week_nummer', '-')}</b>", week_style))
    left_cell.append(Paragraph(f"<b>{werkbon.get('jaar', '-')}</b>", week_style))

    bedrijfsnaam_pdf = instellingen.get("bedrijfsnaam", "Smart-Tech BV")
    company_name_style = ParagraphStyle("CompNameBold", fontName="Helvetica-Bold", fontSize=10,
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
    story.append(Spacer(1, 5))

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
    story.append(Spacer(1, 7))

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
    story.append(Spacer(1, 7))
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
        sig_content.append(Paragraph("<b>Handtekening klant</b>", styles["BodySmall"]))
        if werkbon.get("handtekening_naam"):
            sig_content.append(Paragraph(f"Naam: {werkbon.get('handtekening_naam')}", styles["BodySmall"]))
        if werkbon.get("handtekening_datum"):
            datum = werkbon.get("handtekening_datum")
            datum_text = datum.strftime("%d-%m-%Y %H:%M") if isinstance(datum, datetime) else str(datum)[:16]
            sig_content.append(Paragraph(f"Datum: {datum_text}", styles["BodySmall"]))
        sig_bytes = decode_base64_data(werkbon.get("handtekening_data"))
        sig_img = make_safe_reportlab_image(sig_bytes, 60 * mm, 24 * mm)
        if sig_img:
            sig_content.append(Spacer(1, 3))
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


@api_router.post("/auth/users/{user_id}/resend-info", response_model=ResendInfoMailResponse)
async def resend_worker_info_email(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")

    if user.get("rol") == "admin":
        raise HTTPException(status_code=400, detail="Voor beheerders is deze actie niet beschikbaar")

    temp_password = generate_temp_password()
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": hash_password(temp_password), "actief": True}},
    )

    instellingen = await db.instellingen.find_one({"id": "company_settings"}, {"_id": 0}) or {}
    email_result = await send_welcome_email(user["email"], user["naam"], temp_password, instellingen)
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0})

    return ResendInfoMailResponse(
        user=UserResponse(**updated_user),
        email_sent=email_result.get("success", False),
        email_error=email_result.get("error"),
        temp_password=temp_password,
    )

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
