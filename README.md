# Chronix

Chronix is a self-hostable distributed scheduler for durable outbound HTTP webhooks. It uses PostgreSQL as the source of truth, a transactional outbox for reliable queue publication, and lease fencing to provide at-least-once delivery without concurrent execution ownership.

The repository is being hardened phase-by-phase into a production-ready portfolio project. Setup, architecture, API, operating, and deployment documentation will be expanded as each verified phase lands.

## Project boundaries

- Webhook delivery only; Chronix never executes user-supplied code.
- PostgreSQL stores authoritative schedule and execution state.
- BullMQ on Valkey transports execution work.
- The API, scheduler, and executor are independently scalable processes.
- The dashboard communicates with the backend only through the versioned HTTP API.

## License

Chronix is available under the [MIT License](LICENSE).
