import type { AuditActionType } from '../../shared/constants.js'
import type { AuditLogsQueryInput } from '../../shared/schemas/index.js'
import type { AuditLogDTO, PaginatedResult, UserDTO } from '../../shared/types.js'
import type { AuditServiceContract } from '../contracts/services.contract.js'
import type { AuditRepository } from '../repositories/audit.repo.js'

export interface AuditServiceDeps {
  readonly auditRepo: AuditRepository
}

export class AuditService implements AuditServiceContract {
  private readonly deps: AuditServiceDeps

  public constructor(deps: AuditServiceDeps) {
    this.deps = deps
  }

  public log(params: {
    actor?: UserDTO | null
    actionType: AuditActionType
    resourceType: string
    resourceId?: string | number | null
    details?: Record<string, unknown> | null
    ipAddress?: string | null
    userAgent?: string | null
  }): AuditLogDTO {
    const nowIso = new Date().toISOString()
    return this.deps.auditRepo.create({
      actorUserId: params.actor ? params.actor.id : null,
      actorName: params.actor ? params.actor.fullName : null,
      actorRole: params.actor ? params.actor.role : null,
      actionType: params.actionType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      nowIso,
    })
  }

  public listAuditLogs(query: AuditLogsQueryInput): PaginatedResult<AuditLogDTO> {
    return this.deps.auditRepo.listPaginated(query)
  }
}
