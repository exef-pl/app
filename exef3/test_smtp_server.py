"""Simple SMTP test server for development using aiosmtpd."""
import asyncio
import json
import os
import re
import time
from datetime import datetime
from email.message import EmailMessage
from aiosmtpd.controller import Controller

class TestSMTPHandler:
    """Test SMTP handler that saves emails to files."""
    
    def __init__(self, email_dir='./test_emails'):
        self.email_dir = email_dir
        os.makedirs(email_dir, exist_ok=True)
        print(f"📧 Test SMTP server initialized")
        print(f"📁 Emails will be saved to: {self.email_dir}")
    
    async def handle_DATA(self, server, session, envelope):
        """Handle incoming email data."""
        try:
            # Parse email content
            email_content = envelope.content.decode('utf-8', errors='ignore')
            email_data = {
                'timestamp': datetime.utcnow().isoformat(),
                'from': envelope.mail_from,
                'to': list(envelope.rcpt_tos),
                'peer': session.peer[0] if session.peer else 'unknown',
                'raw': email_content,
                'subject': self._extract_subject(email_content),
                'magic_link': self._extract_magic_link(email_content)
            }
            
            # Save email to file
            filename = f"email_{int(time.time())}_{len(os.listdir(self.email_dir))}.json"
            filepath = os.path.join(self.email_dir, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(email_data, f, indent=2, ensure_ascii=False)
            
            print(f"📧 Email received: {email_data['from']} -> {email_data['to']}")
            print(f"📁 Saved to: {filename}")
            
            # Print magic link if found
            if email_data['magic_link']:
                print(f"🔗 Magic link found: {email_data['magic_link']}")
            
            return '250 Message accepted'
            
        except Exception as e:
            print(f"❌ Error processing email: {e}")
            return '451 Requested action aborted: error in processing'
    
    def _extract_subject(self, email_text):
        """Extract subject from email text."""
        lines = email_text.split('\n')
        for line in lines:
            if line.startswith('Subject:'):
                return line.replace('Subject:', '').strip()
        return "No Subject"
    
    def _extract_magic_link(self, email_text):
        """Extract magic link from email text."""
        # Look for http://localhost:8003/api/v1/auth/magic-link?token=...
        pattern = r'http://localhost:\d+/api/v1/auth/magic-link\?token=[a-zA-Z0-9_-]+'
        match = re.search(pattern, email_text)
        
        if match:
            return match.group(0)
        
        # Look for any link containing 'magic-link'
        pattern = r'https?://[^\s<>"{}|\\^`[\]]*magic-link[^\s<>"{}|\\^`[\]]*'
        match = re.search(pattern, email_text)
        
        return match.group(0) if match else None

def run_smtp_server():
    """Run the SMTP server."""
    handler = TestSMTPHandler()
    controller = Controller(handler, hostname='localhost', port=1025)
    
    print("🚀 Starting EXEF3 Test SMTP Server")
    print("📧 Server: localhost:1025")
    print("📁 Emails will be saved to ./test_emails/")
    print("🛑 Press Ctrl+C to stop")
    
    try:
        controller.start()
        print(f"✅ SMTP server started on {controller.hostname}:{controller.port}")
        
        # Keep the server running
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        print("\n🛑 Shutting down SMTP server...")
    finally:
        controller.stop()

if __name__ == "__main__":
    asyncio.run(run_smtp_server())
