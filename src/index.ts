import { buildApp } from './app.js';
import { PostgresCalculationsRepository } from './persistence/postgres.js';
import {
  InMemoryCalculationsRepository,
  type CalculationsRepository,
} from './persistence/repository.js';

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

let repository: CalculationsRepository;
if (databaseUrl) {
  const postgres = new PostgresCalculationsRepository(databaseUrl);
  await postgres.init();
  repository = postgres;
} else {
  // Database-free fallback for local development. The Docker composition
  // always sets DATABASE_URL, so production runs on PostgreSQL.
  console.warn('DATABASE_URL not set — falling back to in-memory persistence (records will not survive a restart)');
  repository = new InMemoryCalculationsRepository();
}

const app = buildApp({ repository, logger: true });

async function shutdown(signal: string): Promise<void> {
  app.log.info(`received ${signal}, shutting down`);
  await app.close();
  await repository.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port, host: '0.0.0.0' });
