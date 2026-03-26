import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

export default function Notifications() {
  const { data: notifications, isLoading, refetch } = trpc.notifications.list.useQuery();
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => refetch() });
  const unread = notifications?.filter((n: any) => !n.isRead).length ?? 0;

  return (
    <Layout>
      <div style={{ marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color:"var(--black)", marginBottom:4 }}>Notificações</h1>
          <p style={{ fontSize:14, color:"var(--muted)" }}>{unread} não lida{unread !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div style={{ background:"white", border:"1px solid var(--border)", borderRadius:16, overflow:"hidden" }}>
        {isLoading ? (
          <div style={{ padding:40, textAlign:"center", color:"var(--muted)", fontSize:14 }}>Carregando...</div>
        ) : !notifications?.length ? (
          <div style={{ padding:56, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
            <p style={{ fontSize:15, fontWeight:600, color:"var(--dark)", marginBottom:4 }}>Nenhuma notificação</p>
            <p style={{ fontSize:13, color:"var(--muted)" }}>Você está em dia!</p>
          </div>
        ) : notifications.map((n: any) => (
          <div key={n.id}
            style={{ padding:"16px 24px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"flex-start", gap:14, background: n.isRead ? "white" : "var(--green-l)", cursor:"pointer" }}
            onClick={() => !n.isRead && markRead.mutate({ id: n.id })}>
            <div style={{ width:10, height:10, borderRadius:"50%", background: n.isRead ? "transparent" : "var(--green)", flexShrink:0, marginTop:5 }} />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, fontWeight: n.isRead ? 400 : 600, color:"var(--dark)", marginBottom:2 }}>{n.title ?? "Notificação"}</p>
              <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.5 }}>{n.message}</p>
            </div>
            <span style={{ fontSize:11, color:"#adb5bd", flexShrink:0 }}>
              {n.createdAt ? new Date(n.createdAt).toLocaleDateString("pt-BR") : ""}
            </span>
          </div>
        ))}
      </div>
    </Layout>
  );
}
