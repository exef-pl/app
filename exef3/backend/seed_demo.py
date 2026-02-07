"""Seed demo data for accounting firm (biuro rachunkowe) scenario.

Creates:
- 1 firm identity (accountant) + 1 firm entity
- 5 client identities + 5 client entities
- Projects (Księgowość 2026, ZUS 2026) per client
- Monthly tasks (Styczeń–Marzec 2026) with documents
- EntityMember links (firm accountant as ACCOUNTANT in each client entity)
- ProjectAuthorizations for the firm to access client projects

Run: docker compose exec backend python -m seed_demo
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from uuid import uuid4
from datetime import datetime, date, timedelta
import random

from app.core.database import engine, SessionLocal
from app.core.security import get_password_hash
from app.core.config import settings
from app.models.models import (
    Base, Identity, Entity, EntityMember, EntityDatabase, Project, ProjectAuthorization,
    ProjectTemplate, Task, Document, DocumentMetadata, DataSource,
    EntityType, ProjectType, TaskRecurrence, TaskStatus, DocumentStatus, AuthorizationRole,
    SourceDirection, SourceType,
)

DEMO_PASSWORD = "demo123"

def uid():
    return str(uuid4())

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Check if already seeded
    if db.query(Identity).filter(Identity.email == "biuro@exef.pl").first():
        print("Demo data already exists. Skipping seed.")
        db.close()
        return

    print("Seeding demo data...")

    # ─── SYSTEM PROJECT TEMPLATES ────────────────────────────────────
    templates = [
        ProjectTemplate(
            id=uid(), code="ksiegowosc_miesiecznie",
            name="Księgowość — opis faktur",
            description="Comiesięczne opisywanie i kategoryzowanie faktur kosztowych i przychodowych.",
            project_type=ProjectType.KSIEGOWOSC,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="{month_name} {year}",
            task_icon="📅", deadline_day=20,
            default_icon="📊", default_color="#3b82f6",
            default_categories=["IT", "Biuro", "Transport", "Media", "Energia", "Usługi", "Materiały", "Inne"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="zus_miesiecznie",
            name="ZUS — rozliczenie miesięczne",
            description="Comiesięczna deklaracja ZUS DRA/RCA/RZA.",
            project_type=ProjectType.ZUS,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="ZUS {month_name} {year}",
            task_icon="🏥", deadline_day=15,
            default_icon="🏥", default_color="#ef4444",
            default_categories=[],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="jpk_miesiecznie",
            name="JPK_V7M — wysyłka miesięczna",
            description="Comiesięczna wysyłka pliku JPK_V7M do urzędu skarbowego.",
            project_type=ProjectType.JPK,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="JPK {month_name} {year}",
            task_icon="📋", deadline_day=25,
            default_icon="📋", default_color="#8b5cf6",
            default_categories=[],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="vat_ue_kwartalnie",
            name="VAT-UE — deklaracja kwartalna",
            description="Kwartalna deklaracja VAT-UE dla transakcji wewnątrzwspólnotowych.",
            project_type=ProjectType.VAT_UE,
            task_recurrence=TaskRecurrence.QUARTERLY,
            task_name_template="VAT-UE {quarter} {year}",
            task_icon="🇪🇺", deadline_day=25,
            default_icon="🇪🇺", default_color="#0ea5e9",
            default_categories=[],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="kpir_miesiecznie",
            name="KPiR — księga przychodów i rozchodów",
            description="Comiesięczne prowadzenie KPiR z eksportem do pliku.",
            project_type=ProjectType.KPIR,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="KPiR {month_name} {year}",
            task_icon="📒", deadline_day=20,
            default_icon="📒", default_color="#10b981",
            default_categories=["Przychody", "Koszty uzyskania", "Inne"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="rd_ipbox_roczne",
            name="R&D / IP Box — rozliczenie roczne",
            description="Roczne rozliczenie ulgi na R&D lub IP Box.",
            project_type=ProjectType.RD_IPBOX,
            task_recurrence=TaskRecurrence.QUARTERLY,
            task_name_template="R&D {quarter} {year}",
            task_icon="🔬", deadline_day=20,
            default_icon="🔬", default_color="#a855f7",
            default_categories=["Wynagrodzenia", "Materiały", "Usługi B+R", "Amortyzacja"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="wplaty_bank_miesiecznie",
            name="Wpłaty bankowe — potwierdzenia",
            description="Comiesięczne zbieranie potwierdzeń wpłat i raportów bankowych. Import z wielu banków (ING, mBank, PKO, Santander, Pekao).",
            project_type=ProjectType.WPLATY,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="Wpłaty {month_name} {year}",
            task_icon="🏦", deadline_day=10,
            default_icon="🏦", default_color="#0ea5e9",
            default_categories=["Przychód", "Zwrot", "Przelew wewnętrzny", "Opłata bankowa", "Inne"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="dowody_platnosci_miesiecznie",
            name="Dowody płatności — potwierdzenia",
            description="Comiesięczne zbieranie i archiwizacja dowodów płatności: potwierdzenia przelewów, KP, KW, wyciągi bankowe.",
            project_type=ProjectType.DOWODY_PLATNOSCI,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="Płatności {month_name} {year}",
            task_icon="💳", deadline_day=10,
            default_icon="💳", default_color="#06b6d4",
            default_categories=["Przelew", "Gotówka", "Karta", "KP", "KW", "Inne"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="druki_przesylki_miesiecznie",
            name="Druki / integracje przesyłek",
            description="Zarządzanie drukami nadawczymi, etykietami przesyłek i integracja z firmami kurierskimi (InPost, DPD, DHL, Poczta Polska, GLS).",
            project_type=ProjectType.DRUKI_PRZESYLKI,
            task_recurrence=TaskRecurrence.MONTHLY,
            task_name_template="Przesyłki {month_name} {year}",
            task_icon="📦", deadline_day=5,
            default_icon="📦", default_color="#f97316",
            default_categories=["InPost", "DPD", "DHL", "Poczta Polska", "GLS", "Kurier", "Inne"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="rekrutacja_cv",
            name="Rekrutacja — zarządzanie CV",
            description="Import CV z emaila, podgląd danych kandydatów, porównywanie w tabeli. Obsługa PDF, DOCX, CSV.",
            project_type=ProjectType.REKRUTACJA,
            task_recurrence=TaskRecurrence.ONCE,
            task_name_template="Rekrutacja {year}",
            task_icon="👥", deadline_day=30,
            default_icon="👥", default_color="#8b5cf6",
            default_categories=["Frontend", "Backend", "DevOps", "QA", "UX/UI", "PM", "HR", "Inne"],
            is_system=True,
        ),
        ProjectTemplate(
            id=uid(), code="umowy_kontrakty",
            name="Umowy / Kontrakty",
            description="Zarządzanie umowami, aneksami i kontraktami. Import z emaila lub upload, śledzenie terminów, stron i statusów.",
            project_type=ProjectType.UMOWY,
            task_recurrence=TaskRecurrence.ONCE,
            task_name_template="Umowy {year}",
            task_icon="📝", deadline_day=30,
            default_icon="📝", default_color="#0ea5e9",
            default_categories=["Umowa o pracę", "Umowa zlecenie", "Umowa o dzieło", "B2B", "NDA", "SLA", "Najem", "Inne"],
            is_system=True,
        ),
    ]
    for t in templates:
        db.add(t)
    print(f"  Created {len(templates)} project templates")

    # ─── FIRM IDENTITY ───────────────────────────────────────────────────
    firm_identity = Identity(
        id=uid(),
        email="biuro@exef.pl",
        password_hash=get_password_hash(DEMO_PASSWORD),
        first_name="Maria",
        last_name="Wiśniewska",
        pesel="72061578901",
        nip="9876543210",
        avatar="MW",
        color="#8b5cf6",
        is_active=True,
        is_verified=True,
    )
    db.add(firm_identity)

    # ─── FIRM ENTITY ─────────────────────────────────────────────────────
    firm_entity = Entity(
        id=uid(),
        type=EntityType.JDG,
        name="Biuro Rachunkowe Wiśniewska",
        nip="9876543210",
        address_street="ul. Księgowa 15/3",
        address_city="Warszawa",
        address_postal="00-100",
        icon="🏢",
        color="#8b5cf6",
        owner_id=firm_identity.id,
    )
    db.add(firm_entity)

    # Firm entity DB config
    db.add(EntityDatabase(
        id=uid(),
        entity_id=firm_entity.id,
        local_db_url=settings.ENTITY_DB_URL_TEMPLATE.format(nip=firm_entity.nip),
        local_db_path=settings.ENTITY_DB_PATH_TEMPLATE.format(nip=firm_entity.nip),
        sync_enabled=False,
        sync_direction="local_to_remote",
        sync_interval_minutes=60,
    ))

    # Firm identity is OWNER of firm entity
    db.add(EntityMember(
        id=uid(),
        entity_id=firm_entity.id,
        identity_id=firm_identity.id,
        role=AuthorizationRole.OWNER,
        can_manage_projects=True,
        can_invite_members=True,
        can_export=True,
    ))

    # ─── CLIENTS ─────────────────────────────────────────────────────────
    clients_data = [
        {
            "identity": {
                "email": "jan.kowalski@example.pl",
                "first_name": "Jan",
                "last_name": "Kowalski",
                "pesel": "85010112345",
                "nip": "1234567890",
                "avatar": "JK",
                "color": "#3b82f6",
            },
            "entity": {
                "type": EntityType.JDG,
                "name": "Jan Kowalski - Usługi IT",
                "nip": "1234567890",
                "address_street": "ul. Programistów 7",
                "address_city": "Kraków",
                "address_postal": "30-001",
                "icon": "👤",
                "color": "#3b82f6",
            },
            "extra_projects": [
                {
                    "name": "R&D / IP Box 2026",
                    "type": ProjectType.RD_IPBOX,
                    "icon": "🔬",
                    "color": "#a855f7",
                    "tasks": [
                        {"name": "Q1 2026", "start": date(2026, 1, 1), "end": date(2026, 3, 31),
                         "deadline": date(2026, 4, 20), "status": TaskStatus.IN_PROGRESS,
                         "docs": (12, 8, 5, 0)},
                    ],
                },
            ],
        },
        {
            "identity": {
                "email": "anna.nowak@example.pl",
                "first_name": "Anna",
                "last_name": "Nowak",
                "pesel": "90052267890",
                "avatar": "AN",
                "color": "#ec4899",
            },
            "entity": {
                "type": EntityType.JDG,
                "name": "Anna Nowak - Grafika",
                "nip": "1111111111",
                "address_street": "ul. Artystyczna 3",
                "address_city": "Wrocław",
                "address_postal": "50-001",
                "icon": "👤",
                "color": "#ec4899",
            },
        },
        {
            "identity": {
                "email": "kontakt@techstartup.pl",
                "first_name": "Piotr",
                "last_name": "Zieliński",
                "pesel": "88031498765",
                "avatar": "PZ",
                "color": "#10b981",
            },
            "entity": {
                "type": EntityType.SPOLKA,
                "name": "TechStartup Sp. z o.o.",
                "nip": "2222222222",
                "regon": "12345678901234",
                "address_street": "ul. Innowacji 42",
                "address_city": "Warszawa",
                "address_postal": "02-500",
                "icon": "🏢",
                "color": "#10b981",
            },
            "extra_projects": [
                {
                    "name": "VAT-UE Q1 2026",
                    "type": ProjectType.VAT_UE,
                    "icon": "🇪🇺",
                    "color": "#0ea5e9",
                    "tasks": [
                        {"name": "Styczeń-Marzec 2026", "start": date(2026, 1, 1), "end": date(2026, 3, 31),
                         "deadline": date(2026, 4, 25), "status": TaskStatus.IN_PROGRESS,
                         "docs": (15, 10, 5, 0)},
                    ],
                },
            ],
        },
        {
            "identity": {
                "email": "lipa@restauracja.pl",
                "first_name": "Tomasz",
                "last_name": "Dąbrowski",
                "pesel": "75092345678",
                "avatar": "TD",
                "color": "#f59e0b",
            },
            "entity": {
                "type": EntityType.JDG,
                "name": "Restauracja Pod Lipą",
                "nip": "3333333333",
                "address_street": "ul. Lipowa 1",
                "address_city": "Poznań",
                "address_postal": "60-001",
                "icon": "🍽️",
                "color": "#f59e0b",
            },
        },
        {
            "identity": {
                "email": "transport@kowalski.pl",
                "first_name": "Adam",
                "last_name": "Kowalski",
                "pesel": "80121256789",
                "avatar": "AK",
                "color": "#06b6d4",
            },
            "entity": {
                "type": EntityType.JDG,
                "name": "Kowalski Transport",
                "nip": "4444444444",
                "address_street": "ul. Transportowa 22",
                "address_city": "Łódź",
                "address_postal": "90-001",
                "icon": "🚛",
                "color": "#06b6d4",
            },
        },
    ]

    # Monthly bookkeeping task templates for Jan 2026
    MONTHS = [
        {"name": "Styczeń 2026", "start": date(2026, 1, 1), "end": date(2026, 1, 31), "deadline": date(2026, 2, 20)},
        {"name": "Luty 2026", "start": date(2026, 2, 1), "end": date(2026, 2, 28), "deadline": date(2026, 3, 20)},
        {"name": "Marzec 2026", "start": date(2026, 3, 1), "end": date(2026, 3, 31), "deadline": date(2026, 4, 20)},
    ]

    # Varying doc counts per client (total, described, approved, exported)
    BOOKKEEPING_STATS = {
        0: [(47, 35, 30, 25), (18, 5, 0, 0), (0, 0, 0, 0)],     # Jan Kowalski - in progress
        1: [(23, 23, 23, 23), (15, 12, 8, 0), (0, 0, 0, 0)],     # Anna Nowak - Jan done
        2: [(89, 45, 30, 20), (42, 10, 0, 0), (0, 0, 0, 0)],     # TechStartup - behind
        3: [(156, 89, 70, 50), (65, 20, 5, 0), (0, 0, 0, 0)],    # Restauracja - behind
        4: [(34, 34, 34, 34), (22, 22, 22, 22), (0, 0, 0, 0)],   # Kowalski Transport - all done
    }

    ZUS_STATS = {
        0: [(3, 3, 3, 3), (3, 1, 0, 0), (0, 0, 0, 0)],
        1: [(2, 2, 2, 2), (2, 0, 0, 0), (0, 0, 0, 0)],
        2: [(5, 5, 5, 3), (5, 2, 0, 0), (0, 0, 0, 0)],
        3: [(4, 4, 4, 4), (4, 1, 0, 0), (0, 0, 0, 0)],
        4: [(3, 3, 3, 3), (3, 3, 3, 3), (0, 0, 0, 0)],
    }

    CONTRACTORS = [
        ("Hosting Pro Sp. z o.o.", "5551234567", "FV/2026/01"),
        ("Biuro Supplies S.A.", "5559876543", "FS/001/2026"),
        ("MediaNet Sp. z o.o.", "5553456789", "FV-2026-0001"),
        ("Uber Poland Sp. z o.o.", "5557654321", "UB/2026/0012"),
        ("OVH Sp. z o.o.", "5552345678", "PL-2026-00045"),
        ("InPost Sp. z o.o.", "5558765432", "FV/IP/2026/112"),
        ("Allegro Sp. z o.o.", "5554567890", "ALG/FV/2026/9"),
        ("Orange Polska S.A.", "5556543210", "F/2026/0134"),
        ("PGE Obrót S.A.", "5551112223", "FV/E/2026/001"),
        ("ENEA S.A.", "5553334445", "EN/2026/0056"),
    ]

    for ci, cdata in enumerate(clients_data):
        # Create client identity
        idata = cdata["identity"]
        client_identity = Identity(
            id=uid(),
            email=idata["email"],
            password_hash=get_password_hash(DEMO_PASSWORD),
            first_name=idata["first_name"],
            last_name=idata["last_name"],
            pesel=idata.get("pesel"),
            nip=idata.get("nip"),
            avatar=idata.get("avatar", "??"),
            color=idata.get("color", "#3b82f6"),
            is_active=True,
            is_verified=True,
        )
        db.add(client_identity)

        # Create client entity
        edata = cdata["entity"]
        client_entity = Entity(
            id=uid(),
            owner_id=client_identity.id,
            **edata,
        )
        db.add(client_entity)

        # Client entity DB config
        client_nip = edata.get("nip") or client_entity.id[:10]
        db.add(EntityDatabase(
            id=uid(),
            entity_id=client_entity.id,
            local_db_url=settings.ENTITY_DB_URL_TEMPLATE.format(nip=client_nip),
            local_db_path=settings.ENTITY_DB_PATH_TEMPLATE.format(nip=client_nip),
            sync_enabled=False,
            sync_direction="local_to_remote",
            sync_interval_minutes=60,
        ))

        # Client identity is OWNER of their own entity
        db.add(EntityMember(
            id=uid(),
            entity_id=client_entity.id,
            identity_id=client_identity.id,
            role=AuthorizationRole.OWNER,
            can_manage_projects=True,
            can_invite_members=True,
            can_export=True,
        ))

        # Firm identity is ACCOUNTANT member of client entity
        db.add(EntityMember(
            id=uid(),
            entity_id=client_entity.id,
            identity_id=firm_identity.id,
            role=AuthorizationRole.ACCOUNTANT,
            can_manage_projects=True,
            can_invite_members=False,
            can_export=True,
        ))

        # ─── Księgowość 2026 project ────────────────────────────────
        bk_project = Project(
            id=uid(),
            entity_id=client_entity.id,
            name="Księgowość 2026",
            type=ProjectType.KSIEGOWOSC,
            year=2026,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 12, 31),
            icon="📊",
            color="#3b82f6",
            is_active=True,
            categories=["IT", "Biuro", "Transport", "Media", "Energia", "Usługi", "Inne"],
        )
        db.add(bk_project)

        # DataSources for bookkeeping
        db.add(DataSource(
            id=uid(), project_id=bk_project.id,
            direction=SourceDirection.IMPORT, source_type=SourceType.EMAIL,
            name=f"Email {idata['email']}", icon="📧",
            config={"host": "imap.example.pl", "port": 993, "username": idata["email"], "folder": "INBOX/Faktury", "days_back": 30},
        ))
        db.add(DataSource(
            id=uid(), project_id=bk_project.id,
            direction=SourceDirection.IMPORT, source_type=SourceType.KSEF,
            name=f"KSeF NIP {edata['nip']}", icon="🏛️",
            config={"nip": edata["nip"], "environment": "test"},
        ))
        db.add(DataSource(
            id=uid(), project_id=bk_project.id,
            direction=SourceDirection.EXPORT, source_type=SourceType.WFIRMA,
            name="wFirma (CSV)", icon="📊",
            config={"encoding": "utf-8-sig", "date_format": "%Y-%m-%d"},
        ))
        db.add(DataSource(
            id=uid(), project_id=bk_project.id,
            direction=SourceDirection.EXPORT, source_type=SourceType.JPK_PKPIR,
            name="JPK_PKPIR (XML)", icon="📋",
            config={"nip": edata["nip"], "company_name": edata["name"]},
        ))

        # Monthly tasks for bookkeeping
        for mi, month in enumerate(MONTHS):
            stats = BOOKKEEPING_STATS[ci][mi]
            total, described, approved, exported = stats

            if total == 0:
                status = TaskStatus.PENDING
            elif exported == total:
                status = TaskStatus.COMPLETED
            elif described < total and mi == 0:
                # Behind schedule for January tasks
                if ci in (2, 3):
                    status = TaskStatus.IN_PROGRESS  # warning will be derived from deadline vs stats
                else:
                    status = TaskStatus.IN_PROGRESS
            else:
                status = TaskStatus.IN_PROGRESS if total > 0 else TaskStatus.PENDING

            task = Task(
                id=uid(),
                project_id=bk_project.id,
                name=month["name"],
                icon="📅",
                period_start=month["start"],
                period_end=month["end"],
                deadline=month["deadline"],
                status=status,
                docs_total=total,
                docs_described=described,
                docs_approved=approved,
                docs_exported=exported,
            )
            db.add(task)

            # Generate documents for this task
            _create_documents(db, task, total, described, approved, exported, firm_identity.id)

        # Grant firm identity authorization to bookkeeping project
        db.add(ProjectAuthorization(
            id=uid(),
            project_id=bk_project.id,
            identity_id=firm_identity.id,
            role=AuthorizationRole.ACCOUNTANT,
            can_view=True,
            can_describe=True,
            can_approve=True,
            can_export=True,
            granted_by_id=client_identity.id,
        ))

        # ─── ZUS 2026 project ───────────────────────────────────────
        zus_project = Project(
            id=uid(),
            entity_id=client_entity.id,
            name="ZUS 2026",
            type=ProjectType.ZUS,
            year=2026,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 12, 31),
            icon="🏥",
            color="#ef4444",
            is_active=True,
        )
        db.add(zus_project)

        for mi, month in enumerate(MONTHS):
            stats = ZUS_STATS[ci][mi]
            total, described, approved, exported = stats
            status = TaskStatus.COMPLETED if exported == total and total > 0 else (TaskStatus.IN_PROGRESS if total > 0 else TaskStatus.PENDING)

            task = Task(
                id=uid(),
                project_id=zus_project.id,
                name=f"ZUS {month['name']}",
                icon="🏥",
                period_start=month["start"],
                period_end=month["end"],
                deadline=date(month["end"].year, month["end"].month, 15),  # ZUS deadline: 15th of next month
                status=status,
                docs_total=total,
                docs_described=described,
                docs_approved=approved,
                docs_exported=exported,
            )
            db.add(task)

        # Grant firm identity authorization to ZUS project
        db.add(ProjectAuthorization(
            id=uid(),
            project_id=zus_project.id,
            identity_id=firm_identity.id,
            role=AuthorizationRole.ACCOUNTANT,
            can_view=True,
            can_describe=True,
            can_approve=True,
            can_export=True,
            granted_by_id=client_identity.id,
        ))

        # ─── Extra projects ─────────────────────────────────────────
        for extra in cdata.get("extra_projects", []):
            extra_project = Project(
                id=uid(),
                entity_id=client_entity.id,
                name=extra["name"],
                type=extra["type"],
                year=2026,
                period_start=date(2026, 1, 1),
                period_end=date(2026, 12, 31),
                icon=extra.get("icon", "📁"),
                color=extra.get("color", "#3b82f6"),
                is_active=True,
            )
            db.add(extra_project)

            for tdata in extra.get("tasks", []):
                total, described, approved, exported = tdata["docs"]
                task = Task(
                    id=uid(),
                    project_id=extra_project.id,
                    name=tdata["name"],
                    icon=extra.get("icon", "📋"),
                    period_start=tdata["start"],
                    period_end=tdata["end"],
                    deadline=tdata["deadline"],
                    status=tdata["status"],
                    docs_total=total,
                    docs_described=described,
                    docs_approved=approved,
                    docs_exported=exported,
                )
                db.add(task)
                _create_documents(db, task, total, described, approved, exported, firm_identity.id)

            db.add(ProjectAuthorization(
                id=uid(),
                project_id=extra_project.id,
                identity_id=firm_identity.id,
                role=AuthorizationRole.ACCOUNTANT,
                can_view=True,
                can_describe=True,
                can_approve=True,
                can_export=True,
                granted_by_id=client_identity.id,
            ))

    db.commit()
    db.close()
    print("Demo data seeded successfully!")
    print(f"  Firm login:   biuro@exef.pl / {DEMO_PASSWORD}")
    print(f"  Client logins: jan.kowalski@example.pl / {DEMO_PASSWORD}")
    print(f"                 anna.nowak@example.pl / {DEMO_PASSWORD}")
    print(f"                 kontakt@techstartup.pl / {DEMO_PASSWORD}")
    print(f"                 lipa@restauracja.pl / {DEMO_PASSWORD}")
    print(f"                 transport@kowalski.pl / {DEMO_PASSWORD}")


def _create_documents(db, task, total, described, approved, exported, firm_identity_id):
    """Generate realistic documents for a task."""
    CONTRACTORS = [
        ("Hosting Pro Sp. z o.o.", "5551234567"),
        ("Biuro Supplies S.A.", "5559876543"),
        ("MediaNet Sp. z o.o.", "5553456789"),
        ("Uber Poland Sp. z o.o.", "5557654321"),
        ("OVH Sp. z o.o.", "5552345678"),
        ("InPost Sp. z o.o.", "5558765432"),
        ("Allegro Sp. z o.o.", "5554567890"),
        ("Orange Polska S.A.", "5556543210"),
        ("PGE Obrót S.A.", "5551112223"),
        ("ENEA S.A.", "5553334445"),
        ("Leroy Merlin Polska", "5552223334"),
        ("Żabka Polska S.A.", "5554445556"),
    ]

    for di in range(total):
        contractor = CONTRACTORS[di % len(CONTRACTORS)]
        amount_net = round(random.uniform(50, 5000), 2)
        amount_vat = round(amount_net * 0.23, 2)

        if di < exported:
            status = DocumentStatus.EXPORTED
        elif di < approved:
            status = DocumentStatus.APPROVED
        elif di < described:
            status = DocumentStatus.DESCRIBED
        else:
            status = DocumentStatus.NEW

        doc_date = task.period_start + timedelta(days=di % 28) if task.period_start else date(2026, 1, 1)

        doc = Document(
            id=uid(),
            task_id=task.id,
            doc_type="invoice",
            number=f"FV/{doc_date.year}/{doc_date.month:02d}/{di+1:04d}",
            contractor_name=contractor[0],
            contractor_nip=contractor[1],
            amount_net=amount_net,
            amount_vat=amount_vat,
            amount_gross=round(amount_net + amount_vat, 2),
            currency="PLN",
            document_date=doc_date,
            source="ksef" if di % 3 == 0 else ("email" if di % 3 == 1 else "manual"),
            status=status,
        )
        db.add(doc)

        # Add metadata for described+ docs
        if status != DocumentStatus.NEW:
            categories = ["IT", "Biuro", "Transport", "Media", "Energia", "Usługi", "Materiały"]
            meta = DocumentMetadata(
                id=uid(),
                document_id=doc.id,
                category=categories[di % len(categories)],
                description=f"Faktura od {contractor[0]}",
                tags=[],
                edited_by_id=firm_identity_id,
                edited_at=datetime.utcnow(),
            )
            db.add(meta)


if __name__ == "__main__":
    seed()
