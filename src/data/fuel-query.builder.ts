import { env } from '@config/env';
import type { FuelManagementQuery } from '@services/fuel-management.service';

export class FuelQueryBuilder {
  private query: FuelManagementQuery = {};

  static default(): FuelQueryBuilder {
    return new FuelQueryBuilder().defaultWindow();
  }

  defaultWindow(): this {
    this.query.dataIn = env.fuel.window.dataIn;
    this.query.dataFi = env.fuel.window.dataFi;
    return this;
  }

  window(dataIn: string, dataFi: string): this {
    this.query.dataIn = dataIn;
    this.query.dataFi = dataFi;
    return this;
  }

  dataIn(value: string | undefined): this {
    this.query.dataIn = value;
    return this;
  }

  dataFi(value: string | undefined): this {
    this.query.dataFi = value;
    return this;
  }

  withEquips(ids: readonly string[]): this {
    this.query.id_equips = ids.join(',');
    return this;
  }

  withRawEquips(value: string): this {
    this.query.id_equips = value;
    return this;
  }

  page(value: number | string): this {
    this.query.page = value;
    return this;
  }

  build(): FuelManagementQuery {
    return { ...this.query };
  }
}
