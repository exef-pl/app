"""Email service interface for EXEF3."""
import smtplib
import ssl
import secrets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    """Service for sending emails."""
    
    def __init__(self):
        self.smtp_host = getattr(settings, 'SMTP_HOST', 'localhost')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 1025)
        self.smtp_user = getattr(settings, 'SMTP_USER', None)
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', None)
        self.use_tls = getattr(settings, 'SMTP_USE_TLS', False)
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@exef3.local')
    
    async def send_magic_link(self, email: str, magic_link: str, one_time_code: str = None) -> tuple[bool, str]:
        """Send magic link email for login. Returns (success, one_time_code)."""
        try:
            # Generate one-time code if not provided
            if not one_time_code:
                one_time_code = secrets.token_urlsafe(6)[:8].upper()
            
            subject = "EXEF3 - Link logowania"
            
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>EXEF3 - Link logowania</title>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: #3b82f6; color: white; padding: 20px; text-align: center; }}
                    .content {{ padding: 20px; background: #f9fafb; }}
                    .button {{ display: inline-block; background: #3b82f6; color: white; 
                              padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                              margin: 20px 0; }}
                    .code {{ background: #f3f4f6; border: 2px solid #3b82f6; border-radius: 8px; 
                            padding: 16px; text-align: center; font-size: 24px; font-weight: bold; 
                            letter-spacing: 2px; color: #3b82f6; margin: 20px 0; }}
                    .footer {{ padding: 20px; text-align: center; color: #666; font-size: 14px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>EXEF3</h1>
                        <p>Document Flow Engine</p>
                    </div>
                    <div class="content">
                        <h2>Link logowania</h2>
                        <p>Witaj! Otrzymujesz ten email, ponieważ poproszono o link logowania do EXEF3.</p>
                        <p><strong>Masz dwie opcje logowania:</strong></p>
                        
                        <h3>Opcja 1: Kliknij przycisk</h3>
                        <div style="text-align: center;">
                            <a href="{magic_link}" class="button">Zaloguj się</a>
                        </div>
                        
                        <h3>Opcja 2: Użyj kodu jednorazowego</h3>
                        <p>Wpisz ten kod w formularzu logowania:</p>
                        <div class="code">{one_time_code}</div>
                        
                        <p>Link i kod są ważne przez 15 minut.</p>
                        <p>Jeśli nie prosiłeś o ten link, zignoruj tę wiadomość.</p>
                        
                        <p>Alternatywnie, skopiuj i wklej ten link do przeglądarki:</p>
                        <p style="word-break: break-all; background: #e5e7eb; padding: 10px; border-radius: 4px;">
                            {magic_link}
                        </p>
                    </div>
                    <div class="footer">
                        <p>© 2024 EXEF3 - Document Flow Engine</p>
                        <p>Ta wiadomość została wygenerowana automatycznie.</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            text_content = f"""
EXEF3 - Link logowania

Witaj! Otrzymujesz ten email, ponieważ poproszono o link logowania do EXEF3.

MASZ DWIE OPCJE LOGOWANIA:

1. Kliknij poniższy link, aby zalogować się do systemu:
{magic_link}

2. Użyj kodu jednorazowego: {one_time_code}

Wpisz ten kod w formularzu logowania.

Link i kod są ważne przez 15 minut.
Jeśli nie prosiłeś o ten link, zignoruj tę wiadomość.

© 2024 EXEF3 - Document Flow Engine
            """
            
            # Send email and return result
            success = await self._send_email(
                to_email=email,
                subject=subject,
                text_content=text_content,
                html_content=html_content
            )
            
            return success, one_time_code
            
        except Exception as e:
            logger.error(f"Failed to send magic link to {email}: {e}")
            return False, None
    
    async def _send_email(self, to_email: str, subject: str, text_content: str, html_content: str, one_time_code: str = None) -> bool:
        """Send email using SMTP."""
        try:
            message = MIMEMultipart("alternative")
            message["Subject"] = subject
            message["From"] = self.from_email
            message["To"] = to_email
            
            # Add text and HTML parts
            text_part = MIMEText(text_content, "plain", "utf-8")
            html_part = MIMEText(html_content, "html", "utf-8")
            
            message.attach(text_part)
            message.attach(html_part)
            
            # Send email
            if self.smtp_user and self.smtp_password:
                # With authentication
                context = ssl.create_default_context()
                with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                    if self.use_tls:
                        server.starttls(context=context)
                    server.login(self.smtp_user, self.smtp_password)
                    server.sendmail(self.from_email, to_email, message.as_string())
            else:
                # Without authentication (for local dev server)
                with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                    server.send_message(message)
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except ConnectionRefusedError as e:
            logger.warning(f"SMTP server unavailable ({self.smtp_host}:{self.smtp_port}): {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

# Global email service instance
email_service = EmailService()
