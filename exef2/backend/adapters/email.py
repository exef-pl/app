"""
EXEF Email IMAP Adapter

Imports invoices from email attachments via IMAP.
Supports Gmail, Outlook, and generic IMAP servers.
"""
import asyncio
import email
import imaplib
from email.header import decode_header
from datetime import datetime, timedelta
from typing import Optional
import os
import base64
from . import BaseAdapter, AdapterResult, register_adapter


@register_adapter("email")
class EmailIMAPAdapter(BaseAdapter):
    """
    Email IMAP import adapter
    
    Config:
        - host: IMAP server hostname
        - port: IMAP port (default: 993)
        - username: Email username
        - password: Email password (or app password)
        - folder: Mailbox folder to scan (default: INBOX)
        - days_back: How many days back to scan (default: 7)
        - mark_read: Mark processed emails as read (default: True)
        - delete_after: Delete emails after processing (default: False)
    """
    
    name = "email"
    supports_pull = True
    supports_push = False
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.host = config.get("host", os.getenv("EXEF_IMAP_HOST", ""))
        self.port = int(config.get("port", os.getenv("EXEF_IMAP_PORT", 993)))
        self.username = config.get("username", os.getenv("EXEF_IMAP_USER", ""))
        self.password = config.get("password", os.getenv("EXEF_IMAP_PASS", ""))
        self.folder = config.get("folder", "INBOX")
        self.days_back = int(config.get("days_back", 7))
        self.mark_read = config.get("mark_read", True)
        self.delete_after = config.get("delete_after", False)
    
    def _validate_config(self) -> bool:
        return bool(self.host and self.username and self.password)
    
    async def _pull(self) -> AdapterResult:
        """Pull invoices from email"""
        if not self._validate_config():
            return AdapterResult(success=False, errors=["Invalid IMAP configuration"])
        
        try:
            # Run sync IMAP operations in executor
            loop = asyncio.get_event_loop()
            documents = await loop.run_in_executor(None, self._fetch_emails)
            
            self.last_sync = datetime.utcnow()
            
            return AdapterResult(
                success=True,
                count=len(documents),
                documents=documents,
                metadata={
                    "folder": self.folder,
                    "days_scanned": self.days_back
                }
            )
            
        except Exception as e:
            return AdapterResult(success=False, errors=[str(e)])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        return AdapterResult(success=False, errors=["Push not supported for email import"])
    
    def _fetch_emails(self) -> list[dict]:
        """Fetch emails with invoice attachments"""
        documents = []
        
        # Connect to IMAP server
        mail = imaplib.IMAP4_SSL(self.host, self.port)
        mail.login(self.username, self.password)
        mail.select(self.folder)
        
        # Search for emails from last N days
        since_date = (datetime.utcnow() - timedelta(days=self.days_back)).strftime("%d-%b-%Y")
        search_criteria = f'(SINCE {since_date})'
        
        # Add filter for invoice-related subjects
        # search_criteria = f'(SINCE {since_date} OR SUBJECT "faktura" SUBJECT "invoice" SUBJECT "rachunek")'
        
        _, message_numbers = mail.search(None, search_criteria)
        
        for num in message_numbers[0].split():
            try:
                _, msg_data = mail.fetch(num, "(RFC822)")
                email_body = msg_data[0][1]
                email_message = email.message_from_bytes(email_body)
                
                # Extract attachments
                attachments = self._extract_attachments(email_message)
                
                for att in attachments:
                    if self._is_invoice_file(att["filename"]):
                        doc = {
                            "type": "invoice",
                            "number": f"EMAIL-{num.decode()}-{att['filename'][:20]}",
                            "contractor": self._extract_sender(email_message),
                            "amount": 0,  # Would need OCR to extract
                            "source": "email",
                            "email_subject": self._decode_header(email_message.get("Subject", "")),
                            "email_from": self._extract_sender(email_message),
                            "email_date": email_message.get("Date", ""),
                            "attachment_filename": att["filename"],
                            "attachment_mime": att["mime_type"],
                            "attachment_content": att["content_b64"]
                        }
                        documents.append(doc)
                
                # Mark as read if configured
                if self.mark_read:
                    mail.store(num, '+FLAGS', '\\Seen')
                
                # Delete if configured
                if self.delete_after:
                    mail.store(num, '+FLAGS', '\\Deleted')
                    
            except Exception as e:
                print(f"Error processing email {num}: {e}")
                continue
        
        if self.delete_after:
            mail.expunge()
        
        mail.logout()
        
        return documents
    
    def _extract_attachments(self, msg) -> list[dict]:
        """Extract attachments from email message"""
        attachments = []
        
        if msg.is_multipart():
            for part in msg.walk():
                content_disposition = str(part.get("Content-Disposition", ""))
                
                if "attachment" in content_disposition:
                    filename = part.get_filename()
                    if filename:
                        filename = self._decode_header(filename)
                        content = part.get_payload(decode=True)
                        
                        attachments.append({
                            "filename": filename,
                            "mime_type": part.get_content_type(),
                            "content_b64": base64.b64encode(content).decode() if content else ""
                        })
        
        return attachments
    
    def _is_invoice_file(self, filename: str) -> bool:
        """Check if file is likely an invoice"""
        filename_lower = filename.lower()
        
        # Check extension
        valid_extensions = ['.pdf', '.jpg', '.jpeg', '.png', '.xml']
        if not any(filename_lower.endswith(ext) for ext in valid_extensions):
            return False
        
        # Check for invoice-related keywords (optional)
        invoice_keywords = ['faktura', 'invoice', 'rachunek', 'fv', 'fvat']
        # return any(kw in filename_lower for kw in invoice_keywords)
        
        # Accept all PDFs and images for now
        return True
    
    def _extract_sender(self, msg) -> str:
        """Extract sender name from email"""
        from_header = msg.get("From", "")
        from_header = self._decode_header(from_header)
        
        # Extract just the name part
        if "<" in from_header:
            return from_header.split("<")[0].strip().strip('"')
        return from_header
    
    def _decode_header(self, header: str) -> str:
        """Decode email header to string"""
        if not header:
            return ""
        
        decoded_parts = decode_header(header)
        result = []
        
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                result.append(part.decode(encoding or 'utf-8', errors='replace'))
            else:
                result.append(part)
        
        return "".join(result)
    
    async def test_connection(self) -> bool:
        """Test IMAP connection"""
        if not self._validate_config():
            return False
        
        try:
            mail = imaplib.IMAP4_SSL(self.host, self.port)
            mail.login(self.username, self.password)
            mail.logout()
            return True
        except:
            return False


# Mock adapter for testing
@register_adapter("email_mock")
class EmailMockAdapter(BaseAdapter):
    """Mock email adapter for testing"""
    
    name = "email_mock"
    supports_pull = True
    supports_push = False
    
    async def _pull(self) -> AdapterResult:
        import uuid
        docs = [
            {
                "type": "invoice",
                "number": f"EMAIL-{uuid.uuid4().hex[:8].upper()}",
                "contractor": "Mock Email Sender",
                "amount": 500.00,
                "source": "email_mock",
                "email_subject": "Faktura za usługi - styczeń 2026",
                "email_from": "faktury@example.com",
                "attachment_filename": "faktura_01_2026.pdf"
            }
        ]
        self.last_sync = datetime.utcnow()
        return AdapterResult(success=True, count=1, documents=docs)
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        return AdapterResult(success=False, errors=["Push not supported"])
