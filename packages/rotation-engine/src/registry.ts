import type { IEvidenceDimensionPlugin } from '@project-eden/contracts';
import { WaterDimensionPlugin } from './plugins/water.ts';
import { HeatDimensionPlugin } from './plugins/heat.ts';
import { FloodDimensionPlugin } from './plugins/flood.ts';
import { SoilDimensionPlugin } from './plugins/soil.ts';
import { FodderDimensionPlugin } from './plugins/fodder.ts';
import { IncomeDimensionPlugin } from './plugins/income.ts';
import { PestDimensionPlugin } from './plugins/pest.ts';

export class FeatureRegistry {
  private plugins = new Map<string, IEvidenceDimensionPlugin>();
  private featureFlags = new Map<string, boolean>();

  constructor() {
    this.register(new WaterDimensionPlugin());
    this.register(new HeatDimensionPlugin());
    this.register(new FloodDimensionPlugin());
    this.register(new SoilDimensionPlugin());
    this.register(new FodderDimensionPlugin());
    this.register(new IncomeDimensionPlugin());
    this.register(new PestDimensionPlugin());
  }

  register(plugin: IEvidenceDimensionPlugin): void {
    this.plugins.set(plugin.id, plugin);
    if (!this.featureFlags.has(plugin.id)) {
      this.featureFlags.set(plugin.id, plugin.isEnabled);
    }
  }

  unregister(pluginId: string): boolean {
    this.featureFlags.delete(pluginId);
    return this.plugins.delete(pluginId);
  }

  setFeatureFlag(pluginId: string, enabled: boolean): void {
    if (this.plugins.has(pluginId)) {
      this.featureFlags.set(pluginId, enabled);
    }
  }

  getActivePlugins(): IEvidenceDimensionPlugin[] {
    const active: IEvidenceDimensionPlugin[] = [];
    for (const [id, plugin] of this.plugins.entries()) {
      if (this.featureFlags.get(id) === true) {
        active.push(plugin);
      }
    }
    return active;
  }

  getAllPlugins(): IEvidenceDimensionPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(id: string): IEvidenceDimensionPlugin | undefined {
    return this.plugins.get(id);
  }
}
