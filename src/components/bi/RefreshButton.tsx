import {RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useBi} from "@/lib/bi-context";
export function RefreshButton(){const {reload,loading}=useBi();return <Button variant="outline" size="sm" disabled={loading} onClick={reload}><RefreshCw className="h-4 w-4"/>Atualizar agora</Button>;}
