import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const TOOL_ARG_CHUNK_SIZE = Number(process.env.MR_MAGIC_TOOL_ARG_CHUNK_SIZE) || 400;
const OBJECT_ONLY_TOOL_ARGS = new Set(['build_catalog_payload', 'select_match']);

function shouldLogArgChunks() {
  const value = process.env.MR_MAGIC_LOG_TOOL_ARGS_CHUNKS;
  return value === '1' || value === 'true';
}

function buildPreview(value = '', max = 160) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function logArgumentChunks(logger, toolName, rawArgs) {
  if (typeof rawArgs !== 'string' || !rawArgs.length) return;
  const chunks = Math.ceil(rawArgs.length / TOOL_ARG_CHUNK_SIZE);
  logger.debug('Incoming MCP tool args chunk summary', {
    toolName,
    argLength: rawArgs.length,
    chunkSize: TOOL_ARG_CHUNK_SIZE,
    chunkCount: chunks
  });

  for (let index = 0; index < chunks; index += 1) {
    const start = index * TOOL_ARG_CHUNK_SIZE;
    const end = start + TOOL_ARG_CHUNK_SIZE;
    const chunk = rawArgs.slice(start, end);
    logger.debug('Incoming MCP tool args chunk', {
      toolName,
      chunkIndex: index,
      chunkLength: chunk.length,
      preview: buildPreview(chunk)
    });
  }
}

export function normalizeToolArgs(rawArgs, toolName, logger) {
  if (rawArgs == null) {
    return {};
  }

  if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    logger.debug('Incoming MCP tool args (object)', {
      toolName,
      argType: 'object',
      keyCount: Object.keys(rawArgs).length
    });
    return rawArgs;
  }

  if (typeof rawArgs === 'string') {
    if (OBJECT_ONLY_TOOL_ARGS.has(toolName)) {
      logger.error('Rejected MCP string tool args for object-only tool', {
        toolName,
        argType: 'string',
        argLength: rawArgs.length,
        headPreview: buildPreview(rawArgs.slice(0, 240)),
        tailPreview: buildPreview(rawArgs.slice(-240))
      });
      throw new McpError(
        ErrorCode.InvalidParams,
        `${toolName} requires params.arguments to be an object/record. Do not send a stringified JSON payload for this tool.`
      );
    }

    logger.debug('Incoming MCP tool args (string)', {
      toolName,
      argType: 'string',
      argLength: rawArgs.length,
      headPreview: buildPreview(rawArgs.slice(0, 240)),
      tailPreview: buildPreview(rawArgs.slice(-240))
    });

    logger.warn('Received MCP tool args as string; object arguments are recommended', {
      toolName,
      recommendation:
        'Send params.arguments as a native object. Avoid manual JSON string interpolation for multiline lyric payloads.'
    });

    if (shouldLogArgChunks()) {
      logArgumentChunks(logger, toolName, rawArgs);
    }

    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error('Tool arguments must deserialize to an object');
    } catch (error) {
      logger.error('Failed to parse incoming MCP tool args', {
        toolName,
        argType: 'string',
        argLength: rawArgs.length,
        headPreview: buildPreview(rawArgs.slice(0, 240)),
        tailPreview: buildPreview(rawArgs.slice(-240)),
        error
      });
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid JSON format for params: ${error.message}`
      );
    }
  }

  logger.error('Invalid incoming MCP tool args type', {
    toolName,
    argType: Array.isArray(rawArgs) ? 'array' : typeof rawArgs
  });
  throw new McpError(ErrorCode.InvalidParams, 'Tool arguments must be a JSON object');
}
