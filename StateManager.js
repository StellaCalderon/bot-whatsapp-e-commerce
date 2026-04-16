const config = require("./config");

class StateManager {
    constructor() {
        this.ultimaAccionAgente = {};
        this.estadoWizardEditar = {};
        this.estadoBotEnviando = {};
        this.ultimoTicketCliente = {};
        this.mensajesProcesados = new Map();
        setInterval(() => {
            this._limpiarMensajesProcesados();
            this._limpiarEstadosHuérfanos();
        }, config.INTERVALO_LIMPIEZA_MENSAJES_PROCESADOS);
    }

    _limpiarEstadosHuérfanos() {
        const ahora = Date.now();
        const limite = config.EXPIRACION_CACHE_TICKET_CLIENTE;
        
        for (const [id, val] of Object.entries(this.ultimaAccionAgente)) {
            if (ahora - val > limite) delete this.ultimaAccionAgente[id];
        }
        for (const [id, val] of Object.entries(this.ultimoTicketCliente)) {
            if (ahora - val.timestamp > limite) delete this.ultimoTicketCliente[id];
        }
        for (const [id, val] of Object.entries(this.estadoBotEnviando)) {
            if (val === false) delete this.estadoBotEnviando[id];
        }
    }

    _limpiarMensajesProcesados() {
        const ahora = Date.now();
        const limite = config.EXPIRACION_DEDUPLICACION_MENSAJES;
        for (const [id, ts] of this.mensajesProcesados.entries()) {
            if (ahora - ts > limite) this.mensajesProcesados.delete(id);
        }
    }

    yaProcesado(idMsg) {
        if (this.mensajesProcesados.has(idMsg)) return true;
        this.mensajesProcesados.set(idMsg, Date.now());
        return false;
    }

    setUltimoTicket(chatId, ticketId) {
        this.ultimoTicketCliente[chatId] = { ticketId, timestamp: Date.now() };
    }

    getUltimoTicket(chatId) {
        const t = this.ultimoTicketCliente[chatId];
        if (!t || (Date.now() - t.timestamp > config.EXPIRACION_CACHE_TICKET_CLIENTE)) return null;
        return t.ticketId;
    }

    iniciarWizardEditar(agenteId, campo) {
        this.estadoWizardEditar[agenteId] = { campo, timestamp: Date.now() };
    }

    obtenerWizardEditar(agenteId) {
        const wizard = this.estadoWizardEditar[agenteId];
        if (!wizard || (Date.now() - wizard.timestamp > config.EXPIRACION_WIZARD_EDITAR)) {
            delete this.estadoWizardEditar[agenteId];
            return null;
        }
        return wizard;
    }

    limpiarWizardEditar(agenteId) {
        delete this.estadoWizardEditar[agenteId];
    }
}

module.exports = new StateManager();
