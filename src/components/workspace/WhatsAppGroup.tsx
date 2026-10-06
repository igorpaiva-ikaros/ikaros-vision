import { MessagesSquare, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { isWhatsAppGroupLink } from "@/lib/workspace/whatsapp-group";
export function WhatsAppGroup({ url }: { url?: string | null | undefined }) {
  if (!url || !isWhatsAppGroupLink(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "outline", size: "sm" })}
      onClick={(e) => e.stopPropagation()}
      draggable={false}
    >
      <MessagesSquare className="h-4 w-4" />
      Abrir grupo WhatsApp
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
