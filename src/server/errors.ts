export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly cliExitCode: number
  ) {
    super(message)
  }
}

export class InvalidActionError extends DomainError {
  constructor(message = 'That action is not legal right now.') {
    super(message, 'invalid_action', 409, 2)
  }
}

export class StaleTurnError extends DomainError {
  constructor(message = 'That turn token is stale. Read the current bridge packet and try again.') {
    super(message, 'stale_turn', 409, 3)
  }
}

export class WrongSeatError extends DomainError {
  constructor(message = 'That seat cannot act through this command.') {
    super(message, 'wrong_seat', 403, 4)
  }
}

export class NotToActError extends DomainError {
  constructor(message = 'That seat is not to act.') {
    super(message, 'not_to_act', 409, 5)
  }
}

export class MalformedCommandError extends DomainError {
  constructor(message = 'Command payload is malformed.') {
    super(message, 'malformed_command', 400, 6)
  }
}

export class StorageUnavailableError extends DomainError {
  constructor(message = 'Local storage is unavailable.') {
    super(message, 'storage_unavailable', 503, 7)
  }
}
