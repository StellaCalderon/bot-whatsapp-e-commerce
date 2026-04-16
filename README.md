# WhatsApp Support Bot – E‑commerce

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Web--JS-brightgreen.svg)
![AI](https://img.shields.io/badge/AI-Híbrida-orange.svg)


Un sistema **multi‑empresa** de tickets de soporte técnico y atención al cliente a través de WhatsApp. Diseñado para entornos de e‑commerce, este bot combina Inteligencia Artificial híbrida (NLP local + LLM en la nube), gestión profesional de archivos adjuntos, cola de mensajes offline, encuestas de satisfacción automatizadas y un panel de control integral para agentes.





## Características Principales

* **IA Híbrida**: Clasificación ultra-rápida mediante NLP local con respaldo de modelos avanzados (Gemini 1.5 Flash / Groq) para comprensión profunda de intenciones.
* **Gestión de Adjuntos**: Carpeta dedicada por ticket (`/attachments/ticket_N/`). Los archivos se mueven automáticamente de temporal a permanente al abrirse una incidencia.
* **Panel de Agentes**: Control total mediante comandos de WhatsApp para gestionar el ciclo de vida de los tickets.
* **Multi-tenant**: Soporte para múltiples empresas con configuraciones independientes (horarios, agentes, categorías).
* **Cola Offline**: Gestión de mensajes fuera de horario con procesamiento diferido y reintentos automáticos.
* **Encuestas de Satisfacción**: Envío automático de encuestas (escala 1-5) tras el cierre de tickets, con soporte multi-idioma.
* **Recordatorios Inteligentes**: Notificación automática a todos los agentes cuando un ticket permanece sin asignar.
* **Modo Desarrollador**: Comandos técnicos protegidos para mantenimiento y depuración en tiempo real.




## Comandos del Sistema

### Para Agentes
Gestiona el soporte sin salir de WhatsApp.

| Comando | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `!tickets` | Lista los tickets pendientes (identifica adjuntos con 📎) | `!tickets` |
| `!ver <ID>` | Ver el detalle completo, historial y datos del cliente | `!ver 125` |
| `!responder <ID> <msj>` | Envía una respuesta al cliente y asocia el agente | `!responder 125 Hola, ya revisé...` |
| `!cerrar <ID>` | Cierra el ticket y programa la encuesta | `!cerrar 125` |
| `!asignar <TID> <AID>` | Asigna un ticket específico a un agente | `!asignar 125 3` |
| `!reporte` | Muestra estadísticas de la empresa (satisfacción media, etc.) | `!reporte` |
| `!agente` | Muestra tu perfil actual y categorías asignadas | `!agente` |
| `!editar` | Inicia el asistente (wizard) para editar tu perfil | `!editar` |
| `!categorias` | Lista las categorías de soporte disponibles | `!categorias` |
| `!comandos` | Muestra la ayuda de comandos para agentes | `!comandos` |


### Para Desarrolladores
*Requiere que tu número esté definido en `DEV_PHONE` dentro del archivo `.env`.*

| Comando | Descripción |
| :--- | :--- |
| `!dev ayuda` | Muestra el panel de ayuda técnica |
| `!dev estado` | Informe técnico del usuario (ID interno, idioma, ticket actual) |
| `!dev reentrenar` | Fuerza el reentrenamiento del motor NLU local |
| `!dev limpiar` | Resetea estados temporales y asistentes activos |




## Requisitos Previos

- **Node.js**: Versión 18.x o superior.
- **WhatsApp**: Una cuenta vinculada (personal o Business).
- **APIs (Opcional)**: Claves de [Google Gemini](https://aistudio.google.com/) o [Groq](https://console.groq.com/) para análisis avanzado.


Cree un archivo `.env` en la raíz con los siguientes parámetros:

- `GEMINI_API_KEY`: Tu clave de Google AI Studio.
- `GROQ_API_KEY`: Tu clave de Groq Cloud.
- `LLM_API_URL`: URL base para la API de Groq (si se usa).
- `GLOBAL_ADMIN_NUMBER`: Tu número de teléfono (con prefijo, ej: 34600000000).
- `DEV_PHONE`: Número autorizado para ejecutar comandos `!dev`.




## Configuración Avanzada (`config.js`)

Centralizamos el comportamiento del bot en un único archivo de configuración:

- **Rutas**: Define dónde se guardan los adjuntos (`ATTACHMENTS_PATH`) y el modelo NLP (`MODEL_PATH`).
- **Intervalos**: Ajusta la frecuencia de encuestas (`INTERVALO_ENCUESTA`), recordatorios y limpieza de caché.
- **Umbrales de IA**: Configura el nivel de confianza mínimo para la detección local (`UMBRAL_CONFIANZA_IA_LOCAL`).
- **Límites**: Controla el máximo de mensajes en el historial y la longitud de las descripciones en listas.




## Estructura del Proyecto

```text
.
├── attachments/          # Adjuntos organizados por ticket
├── .wwebjs_auth/         # Sesiones de WhatsApp (No tocar)
├── config.js             # Constantes centrales del sistema
├── Database.js           # Capa de persistencia SQLite
├── ia_bot.js             # Motor de IA híbrida
├── AgentManager.js       # Lógica de comandos para agentes
├── DevManager.js         # Comandos de mantenimiento técnico
├── TicketIntentResolver.js # Lógica de resolución de intenciones
├── MessageSender.js      # Envío con simulación de comportamiento humano
├── OfflineQueue.js       # Gestión de cola fuera de horario
├── SatisfactionSurveyWorker.js # Sistema automático de encuestas
├── TicketReminderWorker.js     # Notificación de tickets pendientes
├── StateManager.js       # Gestión de estados temporales en memoria
├── utils.js              # Funciones de utilidad y limpiezas
├── companies_config.js   # Definición y reglas por empresa
├── index.js              # Punto de entrada de la aplicación
└── manage_companies.js   # Script para gestión de base de datos
```






## Flujo de Trabajo Típico

1. **Cliente**: Escribe *"No puedo iniciar sesión"*.
2. **Bot**: Mediante IA detecta la intención, crea el **Ticket #142** (Categoría: *Cuenta*) y responde confirmando la recepción.
3. **Agente**: Recibe el aviso, usa `!tickets` para ver la cola.
4. **Agente**: Usa `!responder 142 Prueba a restablecer tu contraseña con este enlace...`.
5. **Cliente**: Recibe la solución en su WhatsApp.
6. **Agente**: Tras confirmar, usa `!cerrar 142`.
7. **Sistema**: A las 48 horas, se envía automáticamente la encuesta de satisfacción.




## Personalización para E-commerce

- **Categorías**: Añade o modifica categorías en `ia_bot.js` (entrenamiento) y `companies_config.js`.
- **Respuestas Predefinidas**: Personaliza los mensajes automáticos en `TicketIntentResolver.js`.
- **Pedidos (Mock Data)**: El sistema incluye un generador de datos falsos de pedidos en `Database.js` (`seedDummyOrders`) para simular la integración con un ERP real.




## Solución de Problemas

*   **Error "Browser is already running"**: El bot incluye una función automática en `utils.js` para limpiar los bloqueos de Chromium al reiniciar.
*   **Comandos no responden**: Asegúrese de que el número desde el que escribe está registrado en el array de agentes de la empresa en `companies_config.js`.
*   **Fallo en la IA**: Verifique que sus claves en `.env` son correctas y que tiene cuota disponible en los proveedores (Gemini/Groq).





## Librerías

- **WhatsApp**: [whatsapp-web.js](https://wwebjs.dev/)
- **NLP**: [node-nlp](https://github.com/axa-group/nlp.js)
- **Persistencia**: [sqlite3](https://github.com/TryGhost/node-sqlite3) & [sqlite](https://github.com/kriasoft/node-sqlite)
- **Utilidades**: [axios](https://axios-http.com/), [faker](https://fakerjs.dev/), [franc-min](https://github.com/wooorm/franc)
