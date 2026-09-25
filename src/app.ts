import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { runCalculation } from './acoustics/engine.js';
import type { CalculationsRepository } from './persistence/repository.js';
import { classroomPreset } from './presets/classroom.js';
import type { CalculationRecord } from './types.js';
import { validateCalculationRequest } from './validation.js';

export interface BuildAppOptions {
  repository: CalculationsRepository;
  logger?: boolean;
}

function validationError(errors: { field: string; reason: string }[]) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: `request rejected: ${errors.length} validation problem(s) found`,
      details: errors,
    },
  };
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const { repository } = options;

  app.get('/health', async () => ({ status: 'ok' }));

  /** Classroom-scale preset payload, ready to POST back to /calculations. */
  app.get('/presets/classroom', async () => classroomPreset);

  app.post('/calculations', async (request, reply) => {
    const validation = validateCalculationRequest(request.body);
    if (!validation.ok) {
      return reply.code(400).send(validationError(validation.errors));
    }

    const result = runCalculation(validation.value);
    const record: CalculationRecord = {
      id: randomUUID(),
      name: validation.value.name,
      createdAt: new Date().toISOString(),
      request: validation.value,
      result,
    };
    await repository.save(record);
    return reply.code(201).send(record);
  });

  app.get('/calculations', async () => {
    const items = await repository.list();
    return { items, total: items.length };
  });

  app.get('/calculations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await repository.findById(id);
    if (!record) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `no calculation with id ${id}` },
      });
    }
    return record;
  });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'unknown route' },
    });
  });

  app.setErrorHandler(async (error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const code = statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
    return reply.code(statusCode).send({
      error: { code, message: error.message },
    });
  });

  return app;
}
