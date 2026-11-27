declare namespace Cloudflare {
  interface Env {
    ADMIN_PASSWORD?: string;
    ADMIN_SESSION_SECRET?: string;
    UNSUBSCRIBE_SECRET?: string;
    /** Inbox that receives everything sent to info@jaknaskolu.cz (the Email Routing rule points at this Worker). */
    MAIL_FORWARD_TO?: string;
  }
}
