/**
 * @module agents/workflow-runtime
 * @description Workflow multi-step locale con budget, checkpoint atomici e consenso per ogni passo.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// #region 01 — Validazione e persistenza

const MAX_STEPS = 8;
const TERMINAL_STATUSES = new Set(['complete', 'denied', 'cancelled', 'failed', 'reverted']);

function workflowFailure(message, code = 'WORKFLOW_INVALID', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function workflowId(value) {
  const id = String(value || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw workflowFailure('ID workflow non valido.', 'WORKFLOW_ID_INVALID');
  return id;
}

function validateSteps(steps, allowedTools = null) {
  if (!Array.isArray(steps) || !steps.length || steps.length > MAX_STEPS) {
    throw workflowFailure(`Il workflow deve contenere da 1 a ${MAX_STEPS} passaggi.`, 'WORKFLOW_STEPS_INVALID');
  }
  return steps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step) || typeof step.tool !== 'string') {
      throw workflowFailure(`Passaggio ${index + 1} non valido.`, 'WORKFLOW_STEP_INVALID');
    }
    const tool = step.tool.trim().slice(0, 64);
    if (!/^[a-z][a-z0-9_]*$/.test(tool) || (allowedTools && !allowedTools.has(tool))) {
      throw workflowFailure(`Strumento non disponibile nel passaggio ${index + 1}.`, 'WORKFLOW_TOOL_UNAVAILABLE');
    }
    const argumentsValue = step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments)
      ? step.arguments
      : {};
    return {
      id: String(step.id || `step-${index + 1}`).trim().slice(0, 80) || `step-${index + 1}`,
      tool,
      arguments: argumentsValue,
      status: 'pending'
    };
  });
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
}

function publicProposal(proposal = {}) {
  return {
    id: String(proposal.id || ''),
    tool: String(proposal.tool || ''),
    summary: String(proposal.summary || '').slice(0, 1000),
    reason: String(proposal.reason || '').slice(0, 1000),
    risk: String(proposal.risk || ''),
    preview: String(proposal.preview || '').slice(0, 12_000),
    phase: String(proposal.phase || 'dry-run'),
    createdAt: Number(proposal.createdAt) || 0,
    expiresAt: Number(proposal.expiresAt) || 0,
    capability: proposal.capability && typeof proposal.capability === 'object'
      ? { ...proposal.capability }
      : undefined
  };
}

function publicWorkflow(workflow) {
  const current = workflow.steps[workflow.cursor] || null;
  return {
    id: workflow.id,
    summary: workflow.summary,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    status: workflow.status,
    cursor: workflow.cursor,
    stepCount: workflow.steps.length,
    currentStep: current ? { id: current.id, tool: current.tool, status: current.status } : null,
    steps: workflow.steps.map((step) => ({
      id: step.id,
      tool: step.tool,
      status: step.status,
      ...(step.result ? { result: { ...step.result } } : {})
    })),
    ...(current?.proposal ? { proposal: { ...current.proposal } } : {})
  };
}

// #endregion

// #region 02 — Workflow con capability monouso e approvazione esplicita

class WorkflowRuntime {
  constructor({ actionRuntime, checkpointDirectory, now = () => Date.now() }) {
    if (!actionRuntime || typeof actionRuntime.propose !== 'function' || typeof actionRuntime.execute !== 'function') {
      throw new TypeError('ActionRuntime è obbligatorio per i workflow.');
    }
    this.actionRuntime = actionRuntime;
    this.checkpointDirectory = path.resolve(checkpointDirectory);
    this.now = now;
    this.accepting = true;
    this.activeControllers = new Map();
  }

  allowedTools() {
    const tools = this.actionRuntime.capabilities?.().tools;
    return Array.isArray(tools) ? new Set(tools.map((tool) => tool.name)) : null;
  }

  create({ summary, steps }, { subjectId = '' } = {}) {
    if (!this.accepting) throw workflowFailure('NexusNXS è in fase di chiusura.', 'WORKFLOW_SHUTTING_DOWN', 503);
    const workflow = {
      id: randomUUID(),
      summary: String(summary || '').trim().slice(0, 1000),
      createdAt: this.now(),
      updatedAt: this.now(),
      status: 'pending',
      cursor: 0,
      ownerSubjectId: String(subjectId || '').trim().slice(0, 128),
      steps: validateSteps(steps, this.allowedTools())
    };
    this.save(workflow);
    return workflow;
  }

  filePath(id) {
    return path.join(this.checkpointDirectory, `${workflowId(id)}.json`);
  }

  save(workflow) {
    workflow.updatedAt = this.now();
    atomicWrite(this.filePath(workflow.id), workflow);
  }

  load(id) {
    const canonicalId = workflowId(id);
    let workflow;
    try { workflow = JSON.parse(fs.readFileSync(this.filePath(canonicalId), 'utf8')); }
    catch (error) {
      if (error?.code === 'ENOENT') throw workflowFailure('Workflow non trovato.', 'WORKFLOW_NOT_FOUND', 404);
      throw workflowFailure('Checkpoint workflow non leggibile.', 'WORKFLOW_CHECKPOINT_INVALID', 409);
    }
    if (!workflow || workflow.id !== canonicalId || !Array.isArray(workflow.steps)) {
      throw workflowFailure('Checkpoint workflow non valido.', 'WORKFLOW_CHECKPOINT_INVALID', 409);
    }
    return workflow;
  }

  resolve(value) {
    return typeof value === 'string' ? this.load(value) : value;
  }

  assertOwner(workflow, subjectId = '', requireSubject = false) {
    const owner = String(workflow.ownerSubjectId || '');
    const caller = String(subjectId || '').trim();
    if (requireSubject && (!owner || !caller)) throw workflowFailure('Workflow non disponibile per questa sessione.', 'WORKFLOW_SUBJECT_REQUIRED', 403);
    if (owner && owner !== caller) throw workflowFailure('Workflow non disponibile per questa sessione.', 'WORKFLOW_SUBJECT_MISMATCH', 403);
  }

  status(id, context = {}) {
    const workflow = this.load(id);
    this.assertOwner(workflow, context.subjectId, context.requireSubject === true);
    return publicWorkflow(workflow);
  }

  proposeNext(value, context = {}) {
    if (!this.accepting) throw workflowFailure('NexusNXS è in fase di chiusura.', 'WORKFLOW_SHUTTING_DOWN', 503);
    const workflow = this.resolve(value);
    this.assertOwner(workflow, context.subjectId, context.requireSubject === true);
    if (TERMINAL_STATUSES.has(workflow.status)) return null;
    const step = workflow.steps[workflow.cursor];
    if (!step) return null;
    if (step.status === 'awaiting-approval' && step.proposal) {
      return { workflow: publicWorkflow(workflow), step: { id: step.id, tool: step.tool }, proposal: { ...step.proposal } };
    }
    if (step.status !== 'pending') throw workflowFailure('Il passaggio corrente non può essere pianificato.', 'WORKFLOW_STATE_CONFLICT', 409);
    const proposal = this.actionRuntime.propose({
      summary: `${workflow.summary} · ${step.id}`,
      tool: step.tool,
      arguments: step.arguments
    }, {
      subjectId: context.subjectId,
      deviceIdentity: context.deviceIdentity
    });
    step.status = 'awaiting-approval';
    step.ticket = proposal.id;
    step.proposal = publicProposal(proposal);
    workflow.status = 'awaiting-approval';
    this.save(workflow);
    return {
      workflow: publicWorkflow(workflow),
      workflowId: workflow.id,
      step: { id: step.id, tool: step.tool },
      proposal: { ...step.proposal }
    };
  }

  next(id, context = {}) {
    return this.proposeNext(this.load(id), context);
  }

  async decide(value, decision, context = {}) {
    if (!this.accepting) throw workflowFailure('NexusNXS è in fase di chiusura.', 'WORKFLOW_SHUTTING_DOWN', 503);
    const workflow = this.resolve(value);
    this.assertOwner(workflow, context.subjectId, context.requireSubject === true);
    const step = workflow.steps[workflow.cursor];
    if (!step || step.status !== 'awaiting-approval') {
      throw workflowFailure('Nessun passaggio attende approvazione.', 'WORKFLOW_NOT_AWAITING_APPROVAL', 409);
    }
    const approved = typeof decision === 'boolean' ? decision : decision?.approved === true;
    const suppliedTicket = typeof decision === 'object' ? String(decision?.ticketId || '').trim() : step.ticket;
    if (!suppliedTicket || suppliedTicket !== step.ticket) {
      throw workflowFailure('Il ticket non appartiene al passaggio corrente.', 'WORKFLOW_TICKET_MISMATCH', 409);
    }
    const controller = new AbortController();
    this.activeControllers.set(workflow.id, controller);
    step.status = 'executing';
    workflow.status = 'executing';
    this.save(workflow);
    try {
      const result = await this.actionRuntime.execute(step.ticket, {
        approved,
        approvalMode: 'always',
        transactionId: workflow.id,
        subjectId: context.subjectId,
        deviceIdentity: context.deviceIdentity,
        requireSubject: context.requireSubject === true,
        requireVerifiedIdentity: context.requireVerifiedIdentity === true,
        signal: controller.signal
      });
      delete step.ticket;
      delete step.proposal;
      step.status = approved && result?.status === 'completed' ? 'complete' : 'denied';
      step.result = {
        status: String(result?.status || 'failed'),
        code: result?.code ?? null,
        ...(result?.receipt ? { receipt: result.receipt } : {}),
        ...(typeof result?.receiptPersisted === 'boolean' ? { receiptPersisted: result.receiptPersisted } : {})
      };
      if (!approved || result?.status !== 'completed') workflow.status = approved ? 'failed' : 'denied';
      else {
        workflow.cursor += 1;
        workflow.status = workflow.cursor >= workflow.steps.length ? 'complete' : 'pending';
      }
      this.save(workflow);
      return { workflow: publicWorkflow(workflow), result };
    } catch (error) {
      delete step.ticket;
      delete step.proposal;
      const cancelled = controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ACTION_CANCELLED';
      step.status = cancelled ? 'cancelled' : 'failed';
      step.result = {
        status: cancelled ? 'cancelled' : 'failed',
        code: error?.code || null,
        ...(error?.actionReceipt ? { receipt: error.actionReceipt } : {})
      };
      workflow.status = step.status;
      this.save(workflow);
      error.workflow = publicWorkflow(workflow);
      throw error;
    } finally {
      this.activeControllers.delete(workflow.id);
    }
  }

  async cancel(id, context = {}) {
    const workflow = this.load(id);
    this.assertOwner(workflow, context.subjectId, context.requireSubject === true);
    if (TERMINAL_STATUSES.has(workflow.status)) return { workflow: publicWorkflow(workflow), result: null };
    const active = this.activeControllers.get(workflow.id);
    if (active) {
      active.abort();
      return { workflow: publicWorkflow(workflow), result: { status: 'cancellation-requested' } };
    }
    const step = workflow.steps[workflow.cursor];
    let result = null;
    if (step?.status === 'awaiting-approval' && step.ticket) {
      result = await this.actionRuntime.execute(step.ticket, {
        approved: false,
        approvalMode: 'always',
        transactionId: workflow.id,
        subjectId: context.subjectId,
        deviceIdentity: context.deviceIdentity,
        requireSubject: context.requireSubject === true,
        requireVerifiedIdentity: context.requireVerifiedIdentity === true
      });
      step.result = {
        status: 'cancelled',
        code: result?.code ?? null,
        ...(result?.receipt ? { receipt: result.receipt } : {}),
        ...(typeof result?.receiptPersisted === 'boolean' ? { receiptPersisted: result.receiptPersisted } : {})
      };
      delete step.ticket;
      delete step.proposal;
    }
    if (step && step.status !== 'complete') step.status = 'cancelled';
    workflow.status = 'cancelled';
    this.save(workflow);
    return { workflow: publicWorkflow(workflow), result };
  }

  undo(value, context = {}) {
    const workflow = this.resolve(value);
    this.assertOwner(workflow, context.subjectId, context.requireSubject === true);
    const result = this.actionRuntime.undoTransaction(workflow.id);
    if (result.status === 'restored') {
      workflow.status = 'reverted';
      workflow.steps.forEach((step) => { if (step.status === 'complete') step.status = 'reverted'; });
      this.save(workflow);
    }
    return { workflow: publicWorkflow(workflow), result };
  }

  shutdown() {
    this.accepting = false;
    for (const controller of this.activeControllers.values()) controller.abort();
    const active = this.activeControllers.size;
    this.activeControllers.clear();
    return { cancelled: active };
  }
}

module.exports = { WorkflowRuntime, validateSteps, publicWorkflow, MAX_STEPS };

// #endregion
