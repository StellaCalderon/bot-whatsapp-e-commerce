

const companiesData = [
    {
        id: "company_1",
        nombre: "Soporte E-commerce ",
        horario_inicio: "00:00",
        horario_fin: "23:59",
        tiempo_respuesta_objetivo: 30, // mins
        agentes: [
            {
                nombre: "Stella",
                telefono: "34622523336",
                categorias: ["tecnico", "cuenta", "facturacion", "pedidos"]
            },
            {
                nombre: "Administrador",
                telefono: "34622523336",
                categorias: ["tecnico", "cuenta", "facturacion", "pedidos"]
            }
        ],
        bienvenida: "¡Hola! Bienvenido a Soporte E-commerce. ¿En qué podemos ayudarte hoy? Puedes consultar el estado de tu pedido o reportar una incidencia.",
        respuestas: [
            {
                intencion: "soporte.categoria_tecnico",
                mensajes: [
                    "He recibido tu solicitud técnica. Estamos revisando los logs del sistema. ¿Podrías indicarme si recibes algún código de error?"
                ]
            },
            {
                intencion: "soporte.categoria_facturacion",
                mensajes: [
                    "Para consultas de facturación, por favor ten a mano tu número de cliente. Un agente revisará tu estado de cuenta en breve."
                ]
            },
            {
                intencion: "soporte.estado_pedido",
                mensajes: [
                    "Estoy consultando el sistema de envíos... Su pedido {ORDER_ID} se encuentra en estado: {ORDER_STATUS}. Fecha estimada: {ORDER_DELIVERY}."
                ]
            },
            {
                intencion: "soporte.gracias",
                mensajes: [
                    "¡De nada! Es un placer ayudarte. ¿Hay algo más en lo que pueda asistirle?",
                    "Gracias a usted. Estaremos aquí si necesita cualquier otra cosa."
                ]
            },
            {
                intencion: "soporte.saludo",
                mensajes: [
                    "¡Hola! Soy el asistente virtual de {EMPRESA}. ¿En qué puedo ayudarte hoy?"
                ]
            },
            {
                intencion: "soporte.despedida",
                mensajes: [
                    "Gracias por contactar con nosotros. ¡Que tenga un excelente día!",
                    "Hasta luego. No dude en escribirnos si surge cualquier otra duda."
                ]
            }
        ]
    }
];

const CONSTANTES = {
    ADMIN_PHONE_GLOBAL: "34622523336", // Teléfono alertas
    TIEMPO_RECORDATORIO_AGENTE: 7200000, // 2 horas
    TIEMPO_ENCUESTA_SATISFACCION: 86400000, // 24 horas
};

module.exports = {
    companiesData,
    CONSTANTES
};
