const StateManager = require("./StateManager");
const Database = require("./Database");
const { ejecutarAutoLearning } = require("./autoLearning");
const { validarID } = require("./utils");
const config = require("./config");

async function handleAgentCommands(client, message, chat, companyConfig) {
    try {
        const body = message.body.trim();
        if (!body.startsWith("!")) return false;

        const parts = body.split(" ");
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        const companyId = companyConfig.id;

        const agenteActual = await Database.getAgentePorTelefono(message.from.split("@")[0]);
        const globalAdmin = process.env.GLOBAL_ADMIN_NUMBER;
        const esGlobalAdmin = globalAdmin && (message.from.includes(globalAdmin) || message.from.includes(globalAdmin.replace(/\D/g, "")));

        if (!agenteActual && !esGlobalAdmin && !["!categorias", "!agente", "!comandos"].includes(command)) {
            await client.sendMessage(message.from, "No estás registrado como agente autorizado para gestionar tickets.");
            return true;
        }

        const wizard = StateManager.obtenerWizardEditar(message.from);
        if (wizard && !body.startsWith("!")) {
            return await handleEditarWizard(client, message, wizard, agenteActual);
        }

        switch (command) {
            case "!tickets":
                const tickets = await Database.listarTicketsAbiertos(companyId);
                if (tickets.length === 0) {
                    await client.sendMessage(message.from, "No hay tickets pendientes en este momento.");
                } else {
                    let list = "*TICKETS PENDIENTES:*\n\n";
                    for (const t of tickets) {
                        let tieneAdjuntos = false;
                        if (t.attachments) {
                            try {
                                tieneAdjuntos = JSON.parse(t.attachments).length > 0;
                            } catch (e) { tieneAdjuntos = false; }
                        }
                        const descCorta = t.descripcion.length > config.LIMITE_DESCRIPCION_TICKET_LISTA
                            ? t.descripcion.substring(0, config.LIMITE_DESCRIPCION_TICKET_LISTA) + "..."
                            : t.descripcion;
                        list += `${tieneAdjuntos ? "(Adjunto) " : ""}#${t.id} | ${t.categoria} | ${t.prioridad.toUpperCase()}\n- ${descCorta}\n- ${t.cliente_numero}\n\n`;
                    }
                    await client.sendMessage(message.from, list);
                }
                break;

            case "!ver":
                if (args.length === 0 || !validarID(args[0])) return client.sendMessage(message.from, "Uso correcto: !ver <ID_TICKET>");
                const ticket = await Database.obtenerTicket(args[0]);

                if (!ticket || ticket.empresa_id !== companyId) {
                    return client.sendMessage(message.from, "El ticket solicitado no existe o no pertenece a tu empresa.");
                }

                const cliente = await Database.getCliente(companyId, ticket.cliente_chatId);
                let detail = `*DETALLE DEL TICKET #${ticket.id}*\n\n`;
                detail += `*Cliente:* ${ticket.cliente_numero}\n`;
                detail += `*Email:* ${cliente?.email || "No registrado"}\n`;
                detail += `*Categoría:* ${ticket.categoria}\n`;
                detail += `*Prioridad:* ${ticket.prioridad.toUpperCase()}\n`;
                detail += `*Creado:* ${ticket.fecha_creacion}\n`;
                detail += `*Descripción:* ${ticket.descripcion}\n`;

                const adjuntos = ticket.attachments ? JSON.parse(ticket.attachments) : [];
                if (adjuntos.length > 0) detail += `*Adjuntos:* ${adjuntos.length} archivos disponibles.\n`;

                const historial = await Database.obtenerUltimosMensajesTicket(ticket.id, config.MAX_MENSAJES_HISTORIAL_TICKET);
                if (historial && historial.length > 0) {
                    detail += `\n*HISTORIAL RECIENTE:*\n`;
                    historial.reverse().forEach(m => {
                        detail += `${m.es_agente ? "↳ [Agente]" : "↳ [Cliente]"} ${m.texto}\n`;
                    });
                }

                detail += `\nPara responder escribe: !responder ${ticket.id} <mensaje>`;
                await client.sendMessage(message.from, detail);
                break;

            case "!responder":
                if (args.length < 2 || !validarID(args[0])) return client.sendMessage(message.from, "Uso correcto: !responder <ID_TICKET> <mensaje>");
                const tId = args[0];
                const responseText = args.slice(1).join(" ");
                const tRes = await Database.obtenerTicket(tId);

                if (!tRes || tRes.empresa_id !== companyId) {
                    return client.sendMessage(message.from, "Error: No se pudo localizar el ticket para el envío.");
                }

                await client.sendMessage(tRes.cliente_chatId, responseText);
                await Database.guardarMensajeTicket(tId, true, responseText);
                await Database.asignarTicket(tId, agenteActual.id);
                await ejecutarAutoLearning(tId, responseText);

                await client.sendMessage(message.from, `Mensaje enviado al ticket #${tId}.`);
                break;

            case "!cerrar":
                if (args.length === 0 || !validarID(args[0])) return client.sendMessage(message.from, "Uso correcto: !cerrar <ID_TICKET>");
                const tClose = await Database.obtenerTicket(args[0]);
                if (!tClose || tClose.empresa_id !== companyId) {
                    return client.sendMessage(message.from, "No se ha podido cerrar el ticket. Verifica el ID.");
                }

                await Database.cerrarTicket(args[0]);
                await client.sendMessage(message.from, `Ticket #${args[0]} finalizado con éxito.`);
                await client.sendMessage(tClose.cliente_chatId, "Su consulta de soporte ha sido cerrada. Gracias por contactarnos.");
                break;

            case "!asignar":
                if (args.length < 2 || !validarID(args[0]) || !validarID(args[1]))
                    return client.sendMessage(message.from, "Uso correcto: !asignar <ID_TICKET> <ID_AGENTE>");

                const tAsig = await Database.obtenerTicket(args[0]);
                const aAsig = await Database.getAgentePorId(args[1]);

                if (!tAsig || tAsig.empresa_id !== companyId || !aAsig || aAsig.empresa_id !== companyId) {
                    return client.sendMessage(message.from, "No se pudo realizar la asignación. Verifica los IDs introducidos.");
                }

                await Database.asignarTicket(args[0], args[1]);
                await client.sendMessage(message.from, `Ticket #${args[0]} asignado a ${aAsig.nombre}.`);
                break;

            case "!reporte":
                const stats = await Database.obtenerReporteTickets(companyId);
                let rep = `*REPORTE DE TICKETS - ${companyConfig.nombre}*\n\n`;
                rep += `Total registrados: ${stats.total}\nAbiertos: ${stats.abiertos || 0}\nEn proceso: ${stats.en_proceso || 0}\nCerrados: ${stats.cerrados || 0}\nSatisfacción media: ${stats.satisfaccion_media ? stats.satisfaccion_media.toFixed(1) : "N/A"}/5`;
                await client.sendMessage(message.from, rep);
                break;

            case "!comandos":
                await client.sendMessage(message.from, "*LISTA DE COMANDOS:* !tickets, !ver <ID>, !responder <ID> <msj>, !cerrar <ID>, !asignar <TID> <AID>, !reporte, !agente, !editar, !categorias\n\nDesarrollador: !dev ayuda, !dev estado, !dev reentrenar, !dev limpiar");
                break;

            case "!agente":
                if (agenteActual) {
                    await client.sendMessage(message.from, `*MI PERFIL DE AGENTE*\nID: ${agenteActual.id}\nNombre: ${agenteActual.nombre}\nCategorías: ${agenteActual.categorias_asignadas}`);
                }
                break;

            case "!editar":
                StateManager.iniciarWizardEditar(message.from, "nombre");
                await client.sendMessage(message.from, "Iniciando asistente de edición. Por favor, escribe tu nuevo *nombre* o !cancelar.");
                break;

            case "!cancelar":
                StateManager.limpiarWizardEditar(message.from);
                await client.sendMessage(message.from, "Asistente cancelado.");
                break;

            default:
                return false;
        }
        return true;
    } catch (error) {
        console.error("(ERROR AGENTE):", error.message);
        await client.sendMessage(message.from, "Lo siento, no pudimos procesar tu solicitud en este momento. Por favor, intenta de nuevo más tarde.");
        return true;
    }
}

async function handleEditarWizard(client, message, wizard, agente) {
    try {
        const text = message.body.trim();
        if (wizard.campo === "nombre") {
            await Database.run("UPDATE agentes SET nombre = ? WHERE id = ?", [text, agente.id]);
            StateManager.iniciarWizardEditar(message.from, "categorias");
            await client.sendMessage(message.from, "Nombre guardado. Ahora escribe las categorías de especialidad (separadas por coma) o !cancelar.");
        } else if (wizard.campo === "categorias") {
            const cats = text.split(",").map(s => s.trim());
            await Database.run("UPDATE agentes SET categorias_asignadas = ? WHERE id = ?", [JSON.stringify(cats), agente.id]);
            StateManager.limpiarWizardEditar(message.from);
            await client.sendMessage(message.from, "Perfil actualizado correctamente.");
        }
        return true;
    } catch (error) {
        console.error("(ERROR) handleEditarWizard:", error.message);
        await client.sendMessage(message.from, "Lo siento, ocurrió un problema al actualizar tu perfil.");
        StateManager.limpiarWizardEditar(message.from);
        return true;
    }
}

module.exports = { handleAgentCommands };
