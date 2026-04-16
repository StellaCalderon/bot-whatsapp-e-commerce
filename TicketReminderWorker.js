const Database = require("./Database");
const config = require("./config");

class TicketReminderWorker {
    static workersActivos = new Map();
    static async iniciar(client, companyId, companyConfig) {
        if (this.workersActivos.has(companyId)) clearInterval(this.workersActivos.get(companyId));
        console.log(`(REMINDER) Worker iniciado para ${companyId}.`);
        const intervalId = setInterval(async () => {
            try {
                const tickets = await Database.listarTicketsAbiertos(companyId);
                const ahora = Date.now();
                for (const ticket of tickets) {
                    const fechaCreacion = new Date(ticket.fecha_creacion).getTime();
                    if (ticket.estado === 'abierto' && !ticket.agente_asignado_id && (ahora - fechaCreacion > config.LIMITE_RECORDATORIO_TICKET_MS)) {
                        const agentes = companyConfig.agentes || [];
                        for (const agente of agentes) {
                            if (agente.telefono) {
                                try {
                                    await client.sendMessage(`${agente.telefono}@c.us`, `️ *RECORDATORIO:* El ticket #${ticket.id} (${ticket.categoria}) sigue sin asignación tras 2 horas.`);
                                } catch (e) { console.error(`(REMINDER) Error notificando a ${agente.telefono}:`, e.message); }
                            }
                        }
                    }
                }
            } catch (err) { console.error("(REMINDER ERROR):", err.message); }
        }, config.INTERVALO_RECORDATORIO_TICKETS);
        this.workersActivos.set(companyId, intervalId);
    }
}
module.exports = TicketReminderWorker;
