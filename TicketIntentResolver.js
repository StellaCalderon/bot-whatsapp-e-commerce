const Database = require("./Database");
const { procesarIA } = require("./ia_bot");
const StateManager = require("./StateManager");

async function handleTicketIntent(company, chatId, body, isEnglish = false) {
    const companyId = company.id;
    let iaResult;

    try {
        iaResult = await procesarIA(body, chatId, isEnglish);
    } catch (error) {
        console.error("(RESOLVER ERROR) Fallo en procesarIA:", error.message);
        return [];
    }

    const intent = iaResult.intent;
    console.log(`(RESOLVER) Intent: ${intent}`);

    if (iaResult.email) {
        const clienteExistente = await Database.getCliente(companyId, chatId);
        if (clienteExistente) {
            await Database.registrarCliente(
                companyId,
                chatId,
                clienteExistente.numero,
                clienteExistente.nombre,
                clienteExistente.idioma,
                iaResult.email
            );
            console.log(`(RESOLVER) Email detectado y guardado: ${iaResult.email}`);
        }
    }

    const responses = [];

    switch (intent) {
        case "saludo":
            responses.push(isEnglish
                ? "Hello! I am the Pro support assistant. How can I help you today?"
                : "¡Hola! Soy el asistente de soporte Pro. ¿En qué puedo ayudarte hoy?");
            break;

        case "apertura_ticket":
        case "categoria_tecnico":
        case "categoria_facturacion":
        case "categoria_cuenta":
        case "categoria_otro":
            const categoria = iaResult.categoria || (intent.startsWith("categoria_") ? intent.replace("categoria_", "") : "otro");
            const descripcion = iaResult.descripcion || body;
            const orderId = iaResult.order_id || null;

            const ticketId = await Database.crearTicket(companyId, chatId, "", categoria, descripcion, orderId);
            StateManager.setUltimoTicket(chatId, ticketId);

            console.log(`(RESOLVER) Ruta: Apertura de Ticket (${categoria})`);
            responses.push(isEnglish
                ? `I have opened a support ticket for you (#${ticketId}). An agent will review it shortly. Category: ${categoria}.`
                : `He abierto un ticket de soporte para ti (#${ticketId}). Un agente lo revisará pronto. Categoría: ${categoria}.`);
            break;

        case "estado_pedido":
            const oId = iaResult.order_id;
            if (oId) {
                const order = await Database.getMockOrder(oId.toUpperCase());
                if (order) {
                    responses.push(isEnglish
                        ? `The status of your order ${oId} is: ${order.status}. Estimated delivery: ${order.estimated_delivery}.`
                        : `El estado de tu pedido ${oId} es: ${order.status}. Entrega estimada: ${order.estimated_delivery}.`);
                } else {
                    responses.push(isEnglish
                        ? `I could not find order ${oId}. Please verify the code.`
                        : `No he podido encontrar el pedido ${oId}. Por favor, verifica el código.`);
                }
            } else {
                responses.push(isEnglish
                    ? "Please provide your order ID (format ORD-XXXXXXXX) to check its status."
                    : "Por favor, indícame tu ID de pedido (ej: ORD-12345678) para consultar su estado.");
            }
            break;

        case "estado_ticket":
            const ultimoTicket = await Database.obtenerUltimoTicketAbierto(companyId, chatId);
            if (ultimoTicket) {
                responses.push(isEnglish
                    ? `The status of your ticket #${ultimoTicket.id} is: ${ultimoTicket.estado}. It's currently in the ${ultimoTicket.categoria} department.`
                    : `El estado de tu ticket #${ultimoTicket.id} es: ${ultimoTicket.estado}. Está en el departamento de ${ultimoTicket.categoria}.`);
            } else {
                responses.push(isEnglish
                    ? "You don't have any active support tickets."
                    : "No tienes ningún ticket de soporte activo en este momento.");
            }
            break;

        case "hablar_humano":
            responses.push(isEnglish
                ? "I'm transferring you to a human agent. Please wait a moment."
                : "Te estoy transfiriendo con un agente humano. Por favor, espera un momento.");
            break;

        case "gracias":
            responses.push(isEnglish ? "You're welcome! Anything else?" : "¡De nada! ¿En qué más puedo ayudarte?");
            break;

        case "despedida":
            responses.push(isEnglish ? "Goodbye! Have a great day." : "¡Adiós! Que tengas un buen día.");
            break;

        case "insatisfaccion":
            responses.push(isEnglish
                ? "I'm sorry for the inconvenience. I'm escalating your case to a supervisor."
                : "Siento mucho las molestias. Estoy escalando tu caso a un supervisor.");
            break;

        default:
            if (body.toLowerCase().includes("pedido") || body.toLowerCase().includes("order")) {
                responses.push(isEnglish ? "What order are you referring to?" : "¿A qué pedido te refieres?");
            } else {
                responses.push(isEnglish
                    ? "I'm not sure I understand. Could you rephrase your question?"
                    : "No estoy seguro de haberte entendido. ¿Podrías reformular tu consulta?");
            }
            break;
    }

    return responses;
}

module.exports = { handleTicketIntent };
