import { AppError } from '@meihua/shared';

export class CaseInFlightError extends AppError {
  constructor(caseId: string) {
    super('CASE_IN_FLIGHT', `case in flight: ${caseId}`);
    this.name = 'CaseInFlightError';
  }
}

/** 进程内 per-case 锁（本地单进程） */
export class CaseLocks {
  private readonly busy = new Set<string>();

  acquire(caseId: string): void {
    if (this.busy.has(caseId)) {
      throw new CaseInFlightError(caseId);
    }
    this.busy.add(caseId);
  }

  release(caseId: string): void {
    this.busy.delete(caseId);
  }

  isBusy(caseId: string): boolean {
    return this.busy.has(caseId);
  }
}
