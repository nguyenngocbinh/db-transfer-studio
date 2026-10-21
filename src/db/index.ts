import { DbAdapter, DbConfig } from '../types';
import { SqlServerAdapter } from './sqlserver';
import { Db2Adapter } from './db2';

export function createAdapter(config: DbConfig): DbAdapter {
  return config.kind === 'sqlserver' ? new SqlServerAdapter(config) : new Db2Adapter(config);
}
