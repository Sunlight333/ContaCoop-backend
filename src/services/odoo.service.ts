import xmlrpc from 'xmlrpc';
import prisma from '../config/database.js';
import { OdooConfigInput } from '../types/index.js';

interface OdooConnection {
  url: string;
  database: string;
  username: string;
  apiKey: string;
  uid?: number;
}

class OdooService {
  private connections: Map<string, OdooConnection> = new Map();

  // Authenticate with Odoo and get user ID
  async authenticate(config: OdooConnection): Promise<number> {
    return new Promise((resolve, reject) => {
      const isHttps = config.url.toLowerCase().startsWith('https://');
      const commonClient = isHttps
        ? xmlrpc.createSecureClient({
            url: `${config.url}/xmlrpc/2/common`,
            rejectUnauthorized: false,
          } as any)
        : xmlrpc.createClient({
            url: `${config.url}/xmlrpc/2/common`,
          });

      commonClient.methodCall(
        'authenticate',
        [config.database, config.username, config.apiKey, {}],
        (error: any, uid: number) => {
          if (error) {
            reject(new Error(`Odoo authentication failed: ${error?.message || error}`));
          } else if (!uid) {
            reject(new Error('Invalid Odoo credentials'));
          } else {
            resolve(uid);
          }
        }
      );
    });
  }

  // Execute a method on Odoo
  async execute<T>(
    config: OdooConnection,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, any> = {}
  ): Promise<T> {
    if (!config.uid) {
      config.uid = await this.authenticate(config);
    }

    return new Promise((resolve, reject) => {
      const isHttps = config.url.toLowerCase().startsWith('https://');
      const objectClient = isHttps
        ? xmlrpc.createSecureClient({
            url: `${config.url}/xmlrpc/2/object`,
            rejectUnauthorized: false,
          } as any)
        : xmlrpc.createClient({
            url: `${config.url}/xmlrpc/2/object`,
          });

      // execute_kw signature: [db, uid, password, model, method, args, kwargs]
      objectClient.methodCall(
        'execute_kw',
        [config.database, config.uid, config.apiKey, model, method, args, kwargs],
        (error: any, result: T) => {
          if (error) {
            reject(new Error(`Odoo execute failed: ${error?.message || error}`));
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  // Search and read records from Odoo
  async searchRead<T>(
    config: OdooConnection,
    model: string,
    domain: unknown[],
    fields: string[],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<T[]> {
    // Odoo search_read expects: domain as positional arg, then fields, limit, offset, order as kwargs
    const kwargs: Record<string, any> = {};
    if (fields && fields.length > 0) kwargs.fields = fields;
    if (options.limit !== undefined) kwargs.limit = options.limit;
    if (options.offset !== undefined) kwargs.offset = options.offset;
    if (options.order) kwargs.order = options.order;

    return this.execute<T[]>(config, model, 'search_read', [domain], kwargs);
  }

  // Get Odoo configuration for a cooperative
  async getConfig(cooperativeId: string): Promise<OdooConnection | null> {
    // Check cache first
    if (this.connections.has(cooperativeId)) {
      return this.connections.get(cooperativeId)!;
    }

    // Load from database
    const odooConfig = await prisma.odooConfig.findUnique({
      where: { cooperativeId },
    });

    if (!odooConfig) {
      return null;
    }

    const connection: OdooConnection = {
      url: odooConfig.url,
      database: odooConfig.database,
      username: odooConfig.username,
      apiKey: odooConfig.apiKey,
    };

    this.connections.set(cooperativeId, connection);
    return connection;
  }

  // Test Odoo connection
  async testConnection(config: OdooConfigInput): Promise<{ success: boolean; message: string }> {
    try {
      const connection: OdooConnection = {
        url: config.url,
        database: config.database,
        username: config.username,
        apiKey: config.apiKey,
      };

      const uid = await this.authenticate(connection);

      if (uid) {
        return { success: true, message: `Connected successfully. User ID: ${uid}` };
      } else {
        return { success: false, message: 'Authentication returned no user ID' };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  // Save Odoo configuration
  async saveConfig(cooperativeId: string, config: OdooConfigInput): Promise<void> {
    await prisma.odooConfig.upsert({
      where: { cooperativeId },
      update: {
        url: config.url,
        database: config.database,
        username: config.username,
        apiKey: config.apiKey,
        isConnected: true,
        updatedAt: new Date(),
      },
      create: {
        cooperativeId,
        url: config.url,
        database: config.database,
        username: config.username,
        apiKey: config.apiKey,
        isConnected: true,
      },
    });

    // Clear cache
    this.connections.delete(cooperativeId);
  }

  // Get connection status
  async getStatus(cooperativeId: string): Promise<{ isConnected: boolean; lastSync: Date | null }> {
    const config = await prisma.odooConfig.findUnique({
      where: { cooperativeId },
      select: { isConnected: true, lastSync: true },
    });

    return {
      isConnected: config?.isConnected || false,
      lastSync: config?.lastSync || null,
    };
  }

  // Fetch balance sheet data from Odoo
  async fetchBalanceSheet(
    cooperativeId: string,
    year: number,
    month: number
  ): Promise<{ success: boolean; records: unknown[]; error?: string }> {
    try {
      const config = await this.getConfig(cooperativeId);
      if (!config) {
        return { success: false, records: [], error: 'Odoo not configured' };
      }

      // Calculate date range for the period
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // Fetch account move lines from Odoo
      const records = await this.searchRead<{
        id: number;
        account_id: [number, string];
        date: string;
        debit: number;
        credit: number;
        name: string;
        ref: string;
      }>(
        config,
        'account.move.line',
        [
          ['date', '>=', startDate.toISOString().split('T')[0]],
          ['date', '<=', endDate.toISOString().split('T')[0]],
          ['parent_state', '=', 'posted'],
        ],
        ['account_id', 'date', 'debit', 'credit', 'name', 'ref'],
        { order: 'account_id' }
      );

      // Also fetch account information to categorize
      const accounts = await this.searchRead<{
        id: number;
        code: string;
        name: string;
        account_type: string;
      }>(
        config,
        'account.account',
        [],
        ['code', 'name', 'account_type'],
        {}
      );

      // Map account types to our categories
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      // Transform records to our format
      const transformedRecords = this.transformBalanceSheetRecords(records, accountMap);

      return { success: true, records: transformedRecords };
    } catch (error) {
      return {
        success: false,
        records: [],
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      };
    }
  }

  // Fetch cash flow data from Odoo
  async fetchCashFlow(
    cooperativeId: string,
    year: number,
    month: number
  ): Promise<{ success: boolean; records: unknown[]; error?: string }> {
    try {
      const config = await this.getConfig(cooperativeId);
      if (!config) {
        return { success: false, records: [], error: 'Odoo not configured' };
      }

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // Fetch payment records
      const payments = await this.searchRead<{
        id: number;
        name: string;
        amount: number;
        payment_type: string;
        date: string;
        ref: string;
      }>(
        config,
        'account.payment',
        [
          ['date', '>=', startDate.toISOString().split('T')[0]],
          ['date', '<=', endDate.toISOString().split('T')[0]],
          ['state', '=', 'posted'],
        ],
        ['name', 'amount', 'payment_type', 'date', 'ref'],
        {}
      );

      // Transform to cash flow entries
      const transformedRecords = payments.map((p) => ({
        description: p.name || p.ref || 'Payment',
        amount: p.payment_type === 'inbound' ? p.amount : -p.amount,
        category: 'operating', // Simplified - in real app, categorize based on account
        odooId: String(p.id),
      }));

      return { success: true, records: transformedRecords };
    } catch (error) {
      return {
        success: false,
        records: [],
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      };
    }
  }

  // Fetch membership fees from Odoo (partners with payments)
  async fetchMembershipFees(
    cooperativeId: string,
    year: number,
    month: number
  ): Promise<{ success: boolean; records: unknown[]; error?: string }> {
    try {
      const config = await this.getConfig(cooperativeId);
      if (!config) {
        return { success: false, records: [], error: 'Odoo not configured' };
      }

      // Fetch partners (members)
      const partners = await this.searchRead<{
        id: number;
        name: string;
        ref: string;
        credit: number;
        debit: number;
      }>(
        config,
        'res.partner',
        [['is_company', '=', false], ['customer_rank', '>', 0]],
        ['name', 'ref', 'credit', 'debit'],
        {}
      );

      // Transform to membership fees
      const transformedRecords = partners.map((p) => ({
        memberId: p.ref || `M${p.id.toString().padStart(3, '0')}`,
        memberName: p.name,
        expectedContribution: 500, // Default expected - should come from config
        paymentMade: p.debit || 0,
        debt: Math.max(0, 500 - (p.debit || 0)),
        status: (p.debit || 0) >= 500 ? 'up_to_date' : 'with_debt',
        odooPartnerId: String(p.id),
      }));

      return { success: true, records: transformedRecords };
    } catch (error) {
      return {
        success: false,
        records: [],
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      };
    }
  }

  // Helper to transform balance sheet records
  private transformBalanceSheetRecords(
    records: {
      id: number;
      account_id: [number, string];
      date: string;
      debit: number;
      credit: number;
      name: string;
      ref: string;
    }[],
    accountMap: Map<number, { id: number; code: string; name: string; account_type: string }>
  ): unknown[] {
    // Group by account
    const accountTotals = new Map<
      number,
      { debit: number; credit: number; code: string; name: string; type: string }
    >();

    for (const record of records) {
      const accountId = record.account_id[0];
      const account = accountMap.get(accountId);

      if (!account) continue;

      const existing = accountTotals.get(accountId) || {
        debit: 0,
        credit: 0,
        code: account.code,
        name: account.name,
        type: account.account_type,
      };

      existing.debit += record.debit;
      existing.credit += record.credit;
      accountTotals.set(accountId, existing);
    }

    // Convert to array and categorize
    return Array.from(accountTotals.entries()).map(([id, data]) => ({
      accountCode: data.code,
      accountName: data.name,
      category: this.mapAccountTypeToCategory(data.type),
      subcategory: data.type,
      initialDebit: 0,
      initialCredit: 0,
      periodDebit: data.debit,
      periodCredit: data.credit,
      finalDebit: data.debit,
      finalCredit: data.credit,
      odooId: String(id),
    }));
  }

  // Map Odoo account type to our categories
  private mapAccountTypeToCategory(accountType: string): 'assets' | 'liabilities' | 'equity' {
    const assetTypes = [
      'asset_receivable',
      'asset_cash',
      'asset_current',
      'asset_non_current',
      'asset_prepayments',
      'asset_fixed',
    ];
    const liabilityTypes = [
      'liability_payable',
      'liability_credit_card',
      'liability_current',
      'liability_non_current',
    ];
    const equityTypes = ['equity', 'equity_unaffected'];

    if (assetTypes.includes(accountType)) return 'assets';
    if (liabilityTypes.includes(accountType)) return 'liabilities';
    if (equityTypes.includes(accountType)) return 'equity';

    // Default to assets for income/expense (they affect equity)
    return 'assets';
  }

  // Update last sync timestamp
  async updateLastSync(cooperativeId: string): Promise<void> {
    await prisma.odooConfig.update({
      where: { cooperativeId },
      data: { lastSync: new Date() },
    });
  }
}

export const odooService = new OdooService();
export default odooService;
