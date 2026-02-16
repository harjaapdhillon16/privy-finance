import { Buffer } from 'buffer';
import { NovaSdk } from 'nova-sdk-js';

interface UploadMetadata {
  documentType: string;
  accountName?: string;
  groupId?: string;
}

interface NovaClientConfig {
  apiKey: string;
  accountId: string;
  groupPrefix: string;
  authUrl?: string;
  mcpUrl?: string;
  rpcUrl?: string;
  contractId?: string;
}

interface DeleteDocumentResult {
  deletedAtSource: boolean;
  method?: string;
  reason?: string;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sanitizeGroupId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export class NovaStorageService {
  private readonly userId: string;
  private readonly config: NovaClientConfig;
  private readonly sdk: NovaSdk;
  private readonly ensuredGroups = new Set<string>();

  constructor(userId: string) {
    this.userId = userId;

    const apiKey = process.env.NOVA_API_KEY || process.env.NEXT_PUBLIC_NOVA_API_KEY;
    const accountId = process.env.NOVA_ACCOUNT_ID;
    const groupPrefix = process.env.NOVA_GROUP_PREFIX || 'privy-finance';

    if (!apiKey) {
      throw new Error('Missing NOVA API key. Set NOVA_API_KEY in your environment.');
    }

    if (!accountId) {
      throw new Error('Missing NOVA account id. Set NOVA_ACCOUNT_ID (e.g. alice.nova-sdk.near).');
    }

    this.config = {
      apiKey,
      accountId,
      groupPrefix,
      authUrl: process.env.NOVA_AUTH_URL,
      mcpUrl: process.env.NOVA_MCP_URL,
      rpcUrl: process.env.NOVA_RPC_URL,
      contractId: process.env.NOVA_CONTRACT_ID,
    };

    this.sdk = new NovaSdk(this.config.accountId, {
      apiKey: this.config.apiKey,
      authUrl: this.config.authUrl,
      mcpUrl: this.config.mcpUrl,
      rpcUrl: this.config.rpcUrl,
      contractId: this.config.contractId,
    });
  }

  private resolveGroupId(explicitGroupId?: string) {
    if (explicitGroupId) return explicitGroupId;

    const userFragment = sanitizeGroupId(this.userId);
    const prefix = sanitizeGroupId(this.config.groupPrefix);

    return sanitizeGroupId(`${prefix}-${userFragment}`);
  }

  private async ensureGroup(groupId: string) {
    if (this.ensuredGroups.has(groupId)) return;

    try {
      await this.sdk.registerGroup(groupId);
    } catch (error) {
      const message = normalizeError(error).toLowerCase();

      if (!message.includes('already') && !message.includes('exists')) {
        throw new Error(`Failed to initialize NOVA group '${groupId}': ${normalizeError(error)}`);
      }
    }

    this.ensuredGroups.add(groupId);
  }

  /**
   * Upload and encrypt a document to NOVA.
   * Returns `documentId` as CID and `encryptionKeyId` as the NOVA group id.
   */
  async uploadDocument(
    file: File,
    metadata: UploadMetadata,
  ): Promise<{ documentId: string; encryptionKeyId: string; transactionId: string; fileHash: string }> {
    try {
      const groupId = this.resolveGroupId(metadata.groupId);
      await this.ensureGroup(groupId);

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await this.sdk.upload(groupId, buffer, file.name);

      return {
        documentId: result.cid,
        encryptionKeyId: groupId,
        transactionId: result.trans_id,
        fileHash: result.file_hash,
      };
    } catch (error) {
      throw new Error(`NOVA upload failed: ${normalizeError(error)}`);
    }
  }

  /**
   * Download and decrypt a document from NOVA.
   * `encryptionKeyId` maps to the NOVA group id.
   */
  async downloadDocument(documentId: string, encryptionKeyId: string): Promise<Blob> {
    try {
      const groupId = this.resolveGroupId(encryptionKeyId);
      const result = await this.sdk.retrieve(groupId, documentId);
      return new Blob([Uint8Array.from(result.data)]);
    } catch (error) {
      throw new Error(`NOVA download failed: ${normalizeError(error)}`);
    }
  }

  /**
   * NOVA SDK doesn't expose a standalone metadata endpoint.
   */
  async getDocumentMetadata(documentId: string, groupId?: string) {
    return {
      cid: documentId,
      groupId: this.resolveGroupId(groupId),
    };
  }

  /**
   * Attempt to delete a document from NOVA if SDK/runtime supports it.
   * If source-delete is not supported by this SDK version, returns
   * `deletedAtSource: false` with an explanatory reason.
   */
  async deleteDocument(documentId: string, encryptionKeyId?: string): Promise<DeleteDocumentResult> {
    const sdk = this.sdk as unknown as Record<string, any>;
    const groupId = this.resolveGroupId(encryptionKeyId);

    const candidates: Array<{ method: string; args: any[] }> = [
      { method: 'delete', args: [groupId, documentId] },
      { method: 'delete', args: [documentId] },
      { method: 'deleteFile', args: [groupId, documentId] },
      { method: 'deleteFile', args: [documentId] },
      { method: 'removeFile', args: [groupId, documentId] },
      { method: 'removeFile', args: [documentId] },
      { method: 'remove', args: [groupId, documentId] },
      { method: 'remove', args: [documentId] },
      { method: 'deleteUpload', args: [groupId, documentId] },
      { method: 'deleteUpload', args: [documentId] },
      { method: 'unpin', args: [documentId] },
    ];

    let attemptedMethod = '';
    let lastError = '';

    for (const candidate of candidates) {
      const fn = sdk[candidate.method];
      if (typeof fn !== 'function') {
        continue;
      }

      attemptedMethod = candidate.method;

      try {
        await fn.apply(this.sdk, candidate.args);
        return {
          deletedAtSource: true,
          method: candidate.method,
        };
      } catch (error) {
        lastError = normalizeError(error);
      }
    }

    if (attemptedMethod) {
      throw new Error(
        `NOVA source delete failed via '${attemptedMethod}': ${lastError || 'Unknown error'}`,
      );
    }

    return {
      deletedAtSource: false,
      reason: 'NOVA SDK currently does not expose a file-delete operation.',
    };
  }

  async listDocuments(filters?: {
    groupId?: string;
  }) {
    const groupId = this.resolveGroupId(filters?.groupId);

    try {
      const transactions = await this.sdk.getTransactionsForGroup(groupId);

      return transactions.map((tx) => ({
        id: tx.ipfs_hash,
        cid: tx.ipfs_hash,
        fileHash: tx.file_hash,
        groupId: tx.group_id,
        uploadedBy: tx.user_id,
      }));
    } catch (error) {
      throw new Error(`NOVA list failed: ${normalizeError(error)}`);
    }
  }

  /**
   * NOVA SDK v1.0.3 does not provide temporary signed URLs.
   */
  async getTemporaryDownloadUrl(
    _documentId: string,
    _encryptionKeyId: string,
    _expiresInSeconds = 300,
  ): Promise<string> {
    throw new Error('Temporary URL generation is not supported by nova-sdk-js. Use downloadDocument instead.');
  }
}
