"""Email service interface for EXEF3."""
import smtplib
import ssl
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
    
    async def send_magic_link(self, email: str, magic_link: str) -> bool:
        """Send magic link email for login."""
        try:
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
                        <p>Kliknij poniższy przycisk, aby zalogować się do systemu:</p>
                        <div style="text-align: center;">
                            <a href="{magic_link}" class="button">Zaloguj się</a>
                        </div>
                        <p>Jeśli nie prosiłeś o ten link, zignoruj tę wiadomość.</p>
                        <p>Link jest ważny przez 15 minut.</p>
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

Kliknij poniższy link, aby zalogować się do systemu:
{magic_link}

Jeśli nie prosiłeś o ten link, zignoruj tę wiadomość.
Link jest ważny przez 15 minut.

© 2024 EXEF3 - Document Flow Engine
            """
            
            return await self._send_email(
                to_email=email,
                subject=subject,
                text_content=text_content,
                html_content=html_content
            )
            
        except Exception as e:
            logger.error(f"Failed to send magic link to {email}: {e}")
            return False
    
    async def _send_email(self, to_email: str, subject: str, text_content: str, html_content: str) -> bool:
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
            
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

# Global email service instance
email_service = EmailService()
