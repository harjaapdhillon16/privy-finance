import axios, { AxiosInstance } from 'axios';

export interface NEARAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NEARAIRequest {
  model: string;
  messages: NEARAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface NEARAIResponse {
  id: string;
  model: string;
  created: number;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tee_attestation?: {
    id: string;
    timestamp: string;
    signature: string;
    verified: boolean;
  };
}

export interface ExtractedPDFTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  confidence?: number;
}

export class NEARAIService {
  private client: AxiosInstance;

  constructor() {
    const apiKey = process.env.NEAR_AI_API_KEY;
    const endpoint = process.env.NEXT_PUBLIC_NEAR_AI_ENDPOINT;

    if (!apiKey || !endpoint) {
      throw new Error('NEAR AI configuration missing from environment variables');
    }

    this.client = axios.create({
      baseURL: endpoint,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
    });
  }

  async createCompletion(request: NEARAIRequest): Promise<NEARAIResponse> {
    const response = await this.client.post('/chat/completions', {
      model: request.model || 'deepseek-ai/DeepSeek-V3.1',
      messages: request.messages,
      max_tokens: request.max_tokens || 4000,
      temperature: request.temperature ?? 0.7,
      stream: false,
      tee_enabled: process.env.NEAR_AI_TEE_ENABLED !== 'false',
    });

    const attestationId = response.headers['x-tee-attestation-id'];
    const attestationSignature = response.headers['x-tee-attestation-signature'];

    return {
      ...response.data,
      tee_attestation: attestationId
        ? {
            id: attestationId,
            timestamp: new Date().toISOString(),
            signature: attestationSignature,
            verified: true,
          }
        : undefined,
    };
  }

  async analyzeTransactions(data: {
    userId: string;
    monthlySummaries: any;
    userProfile: any;
    financialData: any;
    documentChunks?: string[];
  }) {
    const response = await this.createCompletion({
      model: 'deepseek-ai/DeepSeek-V3.1',
      messages: [
        { role: 'system', content: this.buildTransactionAnalysisPrompt() },
        { role: 'user', content: this.buildUserPrompt(data) },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const text = this.extractResponseText(response) || '{}';

    return {
      analysis: this.parseJson(text, 'object'),
      attestation: response.tee_attestation,
      requestId: response.id,
      usage: response.usage,
    };
  }

  async generateOptimizationInsights(data: {
    userId: string;
    analysis: any;
    userProfile: any;
    financialData: any;
    monthlySummaries?: any;
    documentChunks?: string[];
  }) {
    const response = await this.createCompletion({
      model: 'deepseek-ai/DeepSeek-V3.1',
      messages: [
        { role: 'system', content: this.buildOptimizationPrompt() },
        { role: 'user', content: this.buildOptimizationUserPrompt(data) },
      ],
      max_tokens: 4000,
      temperature: 0.8,
    });

    const text = this.extractResponseText(response) || '[]';
    const parsed = this.parseJson(text, 'array');

    return {
      insights: Array.isArray(parsed) ? parsed : [parsed],
      attestation: response.tee_attestation,
      requestId: response.id,
    };
  }

  async generateGoals(data: {
    userId: string;
    analysis: any;
    insights: any[];
    userProfile: any;
    financialData: any;
    monthlySummaries?: any;
    documentChunks?: string[];
  }) {
    const response = await this.createCompletion({
      model: 'deepseek-ai/DeepSeek-V3.1',
      messages: [
        { role: 'system', content: this.buildGoalsPrompt() },
        { role: 'user', content: this.buildGoalsUserPrompt(data) },
      ],
      max_tokens: 3500,
      temperature: 0.6,
    });

    const text = this.extractResponseText(response) || '[]';
    const parsed = this.parseJson(text, 'array');

    return {
      goals: Array.isArray(parsed) ? parsed : [],
      attestation: response.tee_attestation,
      requestId: response.id,
    };
  }

  async generateGoalExecutionPlan(data: {
    goal: {
      name: string;
      description?: string | null;
      category?: string;
      targetAmount: number;
      currentAmount?: number;
      targetDate?: string | null;
      monthlyContribution?: number | null;
      priority?: number;
    };
    userProfile: any;
    financialData: any;
    monthlySummaries?: any;
    analysis?: any;
    existingInsights?: any[];
  }) {
    const response = await this.createCompletion({
      model: 'deepseek-ai/DeepSeek-V3.1',
      messages: [
        { role: 'system', content: this.buildGoalExecutionPrompt() },
        { role: 'user', content: this.buildGoalExecutionUserPrompt(data) },
      ],
      max_tokens: 3500,
      temperature: 0.5,
    });

    const text = this.extractResponseText(response) || '{}';
    const parsed = this.parseJson(text, 'object');

    return {
      plan: parsed || {},
      attestation: response.tee_attestation,
      requestId: response.id,
    };
  }

  async extractTransactionsFromPDFChunks(data: {
    chunks: string[];
    currency?: string;
    metadata?: {
      fileName?: string;
      accountName?: string | null;
      statementPeriodStart?: string | null;
      statementPeriodEnd?: string | null;
      documentType?: string | null;
    };
  }) {
    const chunks = Array.isArray(data.chunks) ? data.chunks : [];
    const currency = String(data.currency || 'USD').toUpperCase();

    if (chunks.length === 0) {
      return {
        transactions: [] as ExtractedPDFTransaction[],
        requestIds: [] as string[],
        attestationIds: [] as string[],
      };
    }

    const requestIds: string[] = [];
    const attestationIds: string[] = [];
    const chunkItems = chunks
      .map((chunk, chunkIndex) => ({
        chunk: String(chunk || '').trim(),
        chunkIndex,
      }))
      .filter((item) => item.chunk.length > 0);

    const chunkConcurrency = this.getParallelism('NEAR_AI_PDF_CHUNK_CONCURRENCY', 6, 20);
    const { output: chunkResults, errors: chunkErrors } = await this.runInBatches(
      chunkItems,
      chunkConcurrency,
      async (item) => {
        const response = await this.createCompletion({
          model: 'deepseek-ai/DeepSeek-V3.1',
          messages: [
            { role: 'system', content: this.buildPDFExtractionPrompt() },
            {
              role: 'user',
              content: this.buildPDFExtractionUserPrompt({
                chunk: item.chunk,
                chunkIndex: item.chunkIndex,
                chunkCount: chunks.length,
                currency,
                metadata: data.metadata,
              }),
            },
          ],
          max_tokens: 3200,
          temperature: 0,
        });

        const text = this.extractResponseText(response) || '{}';
        const parsed = this.parseJson(text, 'object');
        const txRows = this.normalizeExtractedChunkTransactions(parsed);

        return {
          requestId: response.id || null,
          attestationId: response.tee_attestation?.id || null,
          transactions: txRows,
        };
      },
    );

    if (chunkErrors.length > 0) {
      console.error('PDF chunk extraction failed for some chunks', {
        failedChunkCount: chunkErrors.length,
      });
    }

    const extracted = chunkResults.flatMap((result) => result.transactions);
    for (const result of chunkResults) {
      if (result.requestId) requestIds.push(result.requestId);
      if (result.attestationId) attestationIds.push(result.attestationId);
    }

    const cleaned = await this.cleanTransactionNamesWithLLM(extracted, currency);

    return {
      transactions: cleaned,
      requestIds,
      attestationIds,
    };
  }

  async verifyAttestation(attestationId: string): Promise<boolean> {
    try {
      const response = await this.client.get(`/attestations/${attestationId}/verify`);
      return response.data.verified === true;
    } catch (error) {
      console.error('Attestation verification error', error);
      return false;
    }
  }

  private parseJson(text: string, expected: 'object' | 'array' = 'object') {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();

    const attempts: string[] = [cleaned];
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      attempts.push(cleaned.slice(firstBrace, lastBrace + 1));
    }
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      attempts.push(cleaned.slice(firstBracket, lastBracket + 1));
    }

    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);
        if (expected === 'array') {
          return Array.isArray(parsed) ? parsed : [parsed];
        }
        return parsed;
      } catch {
        // Continue.
      }
    }

    if (expected === 'array') return [];
    return {};
  }

  private extractResponseText(response: NEARAIResponse) {
    if (Array.isArray(response.content) && response.content.length > 0) {
      const fromContent = response.content
        .map((item) => item?.text || '')
        .join('')
        .trim();
      if (fromContent) return fromContent;
    }

    if (Array.isArray(response.choices) && response.choices.length > 0) {
      const choice = response.choices[0];
      const messageContent = choice?.message?.content;

      if (typeof messageContent === 'string' && messageContent.trim()) {
        return messageContent.trim();
      }

      if (Array.isArray(messageContent)) {
        const joined = messageContent
          .map((part) => part?.text || '')
          .join('')
          .trim();
        if (joined) return joined;
      }

      if (typeof choice?.text === 'string' && choice.text.trim()) {
        return choice.text.trim();
      }
    }

    return '';
  }

  private getParallelism(envVarName: string, fallback: number, max: number) {
    const parsed = Number(process.env[envVarName]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(Math.max(Math.floor(parsed), 1), max);
  }

  private async runInBatches<T, R>(
    items: T[],
    concurrency: number,
    runner: (item: T, absoluteIndex: number) => Promise<R>,
  ) {
    const output: R[] = [];
    const errors: Array<{ index: number; error: unknown }> = [];
    const size = Math.max(1, concurrency);

    for (let index = 0; index < items.length; index += size) {
      const batch = items.slice(index, index + size);
      const settled = await Promise.allSettled(
        batch.map((item, offset) => runner(item, index + offset)),
      );

      settled.forEach((result, offset) => {
        if (result.status === 'fulfilled') {
          output.push(result.value);
        } else {
          errors.push({ index: index + offset, error: result.reason });
        }
      });
    }

    return {
      output,
      errors,
    };
  }

  private formatDocumentChunks(chunks?: string[]) {
    if (!chunks || chunks.length === 0) {
      return '[]';
    }

    // Keep prompt bounded while still providing representative slices.
    return JSON.stringify(chunks.slice(0, 8), null, 2);
  }

  private getPreferredCurrency(data: any) {
    const candidate = String(
      data?.userProfile?.currency || data?.currency || data?.financialData?.currency || '',
    )
      .trim()
      .toUpperCase();

    return candidate || 'USD';
  }

  private cleanTextValue(value: unknown) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeLLMDate(value: unknown): string | null {
    const raw = this.cleanTextValue(value);
    if (!raw) return null;

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    const parts = raw.split(/[/-]/).map((item) => item.trim());
    if (parts.length !== 3) {
      return null;
    }

    const [first, second, third] = parts;
    const usLike = new Date(`${third}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
    if (!Number.isNaN(usLike.getTime())) {
      return usLike.toISOString().split('T')[0];
    }

    const intlLike = new Date(`${third}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
    if (!Number.isNaN(intlLike.getTime())) {
      return intlLike.toISOString().split('T')[0];
    }

    return null;
  }

  private parseAmountFromLLM(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const raw = this.cleanTextValue(value);
    if (!raw) return null;

    const isCr = /\bcr\b/i.test(raw);
    const isDr = /\bdr\b/i.test(raw);
    const isNegative = raw.includes('(') || raw.startsWith('-') || raw.endsWith('-') || isDr;
    const cleaned = raw.replace(/[$,\s]/g, '').replace(/[()]/g, '').replace(/\b(cr|dr)\b/gi, '');
    const numeric = Number(cleaned);

    if (!Number.isFinite(numeric)) return null;
    if (isNegative) return -Math.abs(numeric);
    if (isCr) return Math.abs(numeric);
    return numeric;
  }

  private normalizeLLMCategory(value: unknown, amount: number) {
    const allowed = new Set([
      'income_salary',
      'income_investment',
      'income_other',
      'housing',
      'groceries',
      'dining',
      'transportation',
      'subscriptions',
      'healthcare',
      'insurance',
      'education',
      'other',
    ]);

    const normalized = this.cleanTextValue(value).toLowerCase().replace(/\s+/g, '_');

    if (allowed.has(normalized)) {
      return normalized;
    }

    if (amount > 0) {
      return 'income_other';
    }

    return 'other';
  }

  private normalizeExtractedChunkTransactions(payload: any): ExtractedPDFTransaction[] {
    const rawRows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.transactions)
      ? payload.transactions
      : [];

    const normalized: ExtractedPDFTransaction[] = [];

    for (const row of rawRows) {
      const date = this.normalizeLLMDate(row?.date || row?.transactionDate || row?.postedDate);
      const amount = this.parseAmountFromLLM(row?.amount);
      const originalDescription = this.cleanTextValue(
        row?.originalDescription || row?.description || row?.merchant || row?.name,
      );
      const cleanedDescription = this.cleanTextValue(
        row?.cleanedDescription || row?.normalizedDescription || row?.cleaned_name,
      );
      const confidenceRaw = Number(row?.confidence);
      const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : undefined;

      if (!date || amount === null || Math.abs(amount) < 0.00001) {
        continue;
      }

      if (confidence !== undefined && confidence < 0.35) {
        continue;
      }

      const description = cleanedDescription || originalDescription;
      if (!description) {
        continue;
      }

      normalized.push({
        date,
        description,
        amount,
        category: this.normalizeLLMCategory(row?.category, amount),
        confidence,
      });
    }

    return normalized;
  }

  private chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private async cleanTransactionNamesWithLLM(
    transactions: ExtractedPDFTransaction[],
    currency: string,
  ): Promise<ExtractedPDFTransaction[]> {
    if (transactions.length === 0) {
      return [];
    }

    const uniqueDescriptions = Array.from(new Set(transactions.map((tx) => this.cleanTextValue(tx.description))));
    if (uniqueDescriptions.length === 0) {
      return transactions;
    }

    const descriptionMap = new Map<string, string>();
    const descriptionBatches = this.chunkArray(uniqueDescriptions, 80);
    const cleanConcurrency = this.getParallelism('NEAR_AI_NAME_CLEAN_CONCURRENCY', 4, 12);
    const { output: mappingGroups, errors: cleanErrors } = await this.runInBatches(
      descriptionBatches,
      cleanConcurrency,
      async (batch) => {
        const response = await this.createCompletion({
          model: 'deepseek-ai/DeepSeek-V3.1',
          messages: [
            { role: 'system', content: this.buildTransactionNameCleaningPrompt() },
            {
              role: 'user',
              content: this.buildTransactionNameCleaningUserPrompt({
                currency,
                descriptions: batch,
              }),
            },
          ],
          max_tokens: 2800,
          temperature: 0,
        });

        const text = this.extractResponseText(response) || '{}';
        const parsed = this.parseJson(text, 'object');
        return Array.isArray(parsed?.mappings) ? parsed.mappings : [];
      },
    );

    if (cleanErrors.length > 0) {
      console.error('Transaction name cleaning failed for some batches', {
        failedBatchCount: cleanErrors.length,
      });
    }

    for (const mappings of mappingGroups) {
      for (const item of mappings) {
        const input = this.cleanTextValue(item?.input);
        const cleaned = this.cleanTextValue(item?.cleaned);
        if (!input || !cleaned) continue;
        descriptionMap.set(input, cleaned);
      }
    }

    return transactions.map((tx) => {
      const cleaned = descriptionMap.get(this.cleanTextValue(tx.description));
      if (!cleaned) return tx;
      return {
        ...tx,
        description: cleaned,
      };
    });
  }

  private buildPDFExtractionPrompt(): string {
    return `You are a strict financial statement extraction engine.

Extract transactions ONLY from the given PDF text chunk.
Do not infer, hallucinate, or summarize.
If a row is uncertain, skip it.

Rules:
- Keep credits/inflows positive, debits/outflows negative.
- Return merchant/transaction name cleaned and normalized.
- Keep dates in YYYY-MM-DD format.
- Categorize each row into one of:
  income_salary, income_investment, income_other, housing, groceries, dining, transportation, subscriptions, healthcare, insurance, education, other
- Do not include balances, totals, headers, page numbers, or account metadata.

Respond ONLY with valid JSON in this structure:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "originalDescription": "string",
      "cleanedDescription": "string",
      "amount": number,
      "category": "string",
      "confidence": number
    }
  ]
}`;
  }

  private buildPDFExtractionUserPrompt(data: {
    chunk: string;
    chunkIndex: number;
    chunkCount: number;
    currency: string;
    metadata?: {
      fileName?: string;
      accountName?: string | null;
      statementPeriodStart?: string | null;
      statementPeriodEnd?: string | null;
      documentType?: string | null;
    };
  }) {
    return `Extract transactions from this statement chunk.

CHUNK INDEX: ${data.chunkIndex + 1} of ${data.chunkCount}
PREFERRED CURRENCY: ${data.currency}
FILE NAME: ${data.metadata?.fileName || ''}
ACCOUNT NAME: ${data.metadata?.accountName || ''}
DOCUMENT TYPE: ${data.metadata?.documentType || ''}
STATEMENT PERIOD START: ${data.metadata?.statementPeriodStart || ''}
STATEMENT PERIOD END: ${data.metadata?.statementPeriodEnd || ''}

CHUNK TEXT:
${data.chunk}`;
  }

  private buildTransactionNameCleaningPrompt(): string {
    return `You normalize transaction names.

Rules:
- Clean noisy card/payment strings to concise canonical names.
- Remove IDs, reference numbers, timestamps, location suffixes, and card tails.
- Keep meaningful merchant/provider words.
- Preserve meaning; do not invent details.

Respond ONLY with valid JSON:
{
  "mappings": [
    { "input": "string", "cleaned": "string" }
  ]
}`;
  }

  private buildTransactionNameCleaningUserPrompt(data: { currency: string; descriptions: string[] }) {
    return `Normalize these transaction names.

PREFERRED CURRENCY: ${data.currency}

INPUT:
${JSON.stringify(data.descriptions, null, 2)}
`;
  }

  private buildTransactionAnalysisPrompt(): string {
    return `You are an expert financial analyst providing comprehensive analysis of user financial data.

Analyze the user's complete financial situation including:
1. Overall financial health assessment
2. Cash flow analysis (income vs expenses, savings rate)
3. Spending patterns and trends
4. Asset allocation
5. Debt analysis
6. Progress toward goals

Provide specific, actionable insights. Be encouraging but honest.
All monetary numbers must be represented in the user's preferred currency.

IMPORTANT: Respond ONLY with valid JSON in this exact structure:
{
  "overall": {
    "healthScore": "Strong|Good|Fair|Needs Improvement",
    "netWorth": number,
    "summary": "string"
  },
  "cashFlow": {
    "monthlyIncome": number,
    "monthlyExpenses": number,
    "savingsRate": number,
    "assessment": "string",
    "topCategories": [{"category": "string", "amount": number, "percentage": number}]
  },
  "spending": {
    "patterns": ["string"],
    "concerns": ["string"],
    "positives": ["string"]
  },
  "recommendations": ["string"]
}`;
  }

  private buildUserPrompt(data: any): string {
    const currency = this.getPreferredCurrency(data);

    return `Analyze this user's financial data:

USER PROFILE:
${JSON.stringify(data.userProfile, null, 2)}

FINANCIAL SNAPSHOT:
${JSON.stringify(data.financialData, null, 2)}

MONTHLY SUMMARIES (latest available months across uploaded documents):
${JSON.stringify(data.monthlySummaries, null, 2)}

PREFERRED CURRENCY:
${currency}

DOCUMENT EXCERPTS (chunked to max 2000 chars each):
${this.formatDocumentChunks(data.documentChunks)}

Provide comprehensive analysis in JSON format.`;
  }

  private buildOptimizationPrompt(): string {
    return `You are a financial optimization expert. Provide specific, actionable recommendations.

For each recommendation:
- title: Clear action (max 50 chars)
- category: cashflow|debt|savings|investing|income
- description: Why it matters (2-3 sentences)
- potentialSavings: numeric amount in user's preferred currency (if applicable)
- potentialEarnings: numeric amount in user's preferred currency (if applicable)
- impactLevel: critical|high|medium|low
- actionSteps: Array of specific steps
- complexity: easy|medium|hard
- estimatedTime: Time to implement

Respond ONLY with valid JSON array of recommendations.`;
  }

  private buildOptimizationUserPrompt(data: any): string {
    const currency = this.getPreferredCurrency(data);

    return `Generate optimization recommendations based on:

ANALYSIS:
${JSON.stringify(data.analysis, null, 2)}

USER PROFILE:
${JSON.stringify(data.userProfile, null, 2)}

FINANCIAL DATA:
${JSON.stringify(data.financialData, null, 2)}

MONTHLY SUMMARIES:
${JSON.stringify(data.monthlySummaries || {}, null, 2)}

PREFERRED CURRENCY:
${currency}

DOCUMENT EXCERPTS (chunked to max 2000 chars each):
${this.formatDocumentChunks(data.documentChunks)}

Provide 5-10 high-impact recommendations in JSON format.`;
  }

  private buildGoalsPrompt(): string {
    return `You are an expert financial planner.

Create practical SMART goals based on the user's documents, analysis, and profile.
Respond ONLY with valid JSON array.

Each goal object MUST include:
- name: string (max 80 chars)
- description: string
- category: string (savings|debt|investing|emergency_fund|income|retirement|other)
- targetAmount: number in user's preferred currency (must be > 0)
- currentAmount: number (>= 0)
- targetDate: string in YYYY-MM-DD format OR null
- monthlyContribution: number in user's preferred currency (>= 0) OR null
- priority: number (1-5, where 1 is highest)

Output 3-6 goals, highest impact first.`;
  }

  private buildGoalsUserPrompt(data: any): string {
    const currency = this.getPreferredCurrency(data);

    return `Generate goals from:

ANALYSIS:
${JSON.stringify(data.analysis, null, 2)}

INSIGHTS:
${JSON.stringify(data.insights || [], null, 2)}

USER PROFILE:
${JSON.stringify(data.userProfile, null, 2)}

FINANCIAL DATA:
${JSON.stringify(data.financialData, null, 2)}

MONTHLY SUMMARIES:
${JSON.stringify(data.monthlySummaries || {}, null, 2)}

PREFERRED CURRENCY:
${currency}

DOCUMENT EXCERPTS (chunked to max 2000 chars each):
${this.formatDocumentChunks(data.documentChunks)}
`;
  }

  private buildGoalExecutionPrompt(): string {
    return `You are a financial planning coach.

Create a practical, detailed execution plan for a user's single financial goal.
Base your advice on their profile, monthly financial summaries, and existing insights.

Respond ONLY with valid JSON object in this exact structure:
{
  "summary": "string",
  "monthlyMilestones": [
    {
      "month": "YYYY-MM",
      "targetAmount": number in preferred currency,
      "why": "string"
    }
  ],
  "actionPlan": [
    {
      "step": "string",
      "timeline": "string",
      "estimatedImpact": number in preferred currency | null
    }
  ],
  "budgetAdjustments": [
    {
      "category": "string",
      "currentMonthly": number in preferred currency | null,
      "recommendedMonthly": number in preferred currency | null,
      "delta": number in preferred currency,
      "reason": "string"
    }
  ],
  "incomeIdeas": ["string"],
  "riskMitigations": ["string"],
  "trackingMetrics": ["string"]
}

Rules:
- 6 to 10 actionPlan steps.
- monthlyMilestones should cover at least the next 6 months if targetDate is unknown.
- Use realistic numbers.
- Keep language concise and actionable.`;
  }

  private buildGoalExecutionUserPrompt(data: any): string {
    const currency = this.getPreferredCurrency(data);

    return `Create an execution plan for this goal:

GOAL:
${JSON.stringify(data.goal, null, 2)}

USER PROFILE:
${JSON.stringify(data.userProfile, null, 2)}

FINANCIAL DATA:
${JSON.stringify(data.financialData, null, 2)}

MONTHLY SUMMARIES:
${JSON.stringify(data.monthlySummaries || {}, null, 2)}

PREFERRED CURRENCY:
${currency}

EXISTING INSIGHTS:
${JSON.stringify(data.existingInsights || [], null, 2)}

LATEST ANALYSIS:
${JSON.stringify(data.analysis || {}, null, 2)}
`;
  }
}
