import {Helper} from "../Helper";
import {ControllerCard} from "../cards/ControllerCard";
import {StackCardConfig} from "../types/homeassistant/lovelace/cards/types";
import {LovelaceViewConfig} from "../types/homeassistant/data/lovelace";
import {cards} from "../types/strategy/cards";
import {TitleCardConfig} from "../types/lovelace-mushroom/cards/title-card-config";
import {HassServiceTarget} from "home-assistant-js-websocket";
import abstractCardConfig = cards.AbstractCardConfig;
import {EntityRegistryEntry} from "../types/homeassistant/data/entity_registry";
import {generic} from "../types/strategy/generic";
import ViewConfig = generic.ViewConfig;
import {views} from "../types/strategy/views";

/**
 * Abstract View Class.
 *
 * To create a new view, extend the new class with this one.
 *
 * @class
 * @abstract
 */
abstract class AbstractView {

  /**
   * The domain of which we operate the devices.
   *
   * @private
   * @readonly
   */
  protected readonly prefix: string;

  protected abstract defaultConfig: views.ViewConfig

  protected abstract viewControllerCardConfig(entities: EntityRegistryEntry[], content?: string): cards.ControllerCardOptions;

  /**
   * Class constructor.
   *
   * @param {string} [domain] The domain which the view is representing.
   *
   * @throws {Error} If trying to instantiate this class.
   * @throws {Error} If the Helper module isn't initialized.
   */
  protected constructor(protected readonly domain: string = '') {
    if (!Helper.isInitialized()) {
      throw new Error("The Helper module must be initialized before using this one.");
    }
    this.domain = domain;
    this.prefix = this.domain ? Helper.getLabelPrefix(this.domain) : ''
  }

  createCard(entities: EntityRegistryEntry[], label?: string): StackCardConfig {
    return new ControllerCard(
      Helper.toTargetEntities(entities),
      {
        ...this.viewControllerCardConfig(entities, label),
        ...("controllerCardOptions" in this.defaultConfig ? this.defaultConfig.controllerCardOptions : {}) as cards.ControllerCardConfig,
      }).createCard();
  };

  /**
   * Create the cards to include in the view.
   *
   * @return {Promise<(StackCardConfig | TitleCardConfig)[]>} An array of card objects.
   */
  async createViewCards(labelFilter: (entity: EntityRegistryEntry) => boolean, label?: string): Promise<(StackCardConfig | TitleCardConfig)[]> {
    const viewCards: StackCardConfig[] = [];
    const configEntityHidden =
            Helper.strategyOptions.domains[this.domain ?? "_"].hide_config_entities
            || Helper.strategyOptions.domains["_"].hide_config_entities;

    // Create cards for each area.
    for (const area of Helper.areas) {
      const areaCards: abstractCardConfig[] = [];
      const entities = Helper.getDeviceEntities(area, this.domain).filter(labelFilter);
      const className = Helper.sanitizeClassName(this.domain + "Card");
      const cardModule = await import(`../cards/${className}`);

      // Set the target for controller cards to the current area.
      let target: HassServiceTarget = {
        area_id: [area.area_id],
      };

      // Set the target for controller cards to entities without an area.
      if (area.area_id === "undisclosed") {
        target = Helper.toTargetEntities(entities);
      }

      // Create a card for each domain-entity of the current area.
      for (const entity of entities) {
        let cardOptions = Helper.strategyOptions.card_options?.[entity.entity_id];
        let deviceOptions = Helper.strategyOptions.card_options?.[entity.device_id ?? "null"];

        if (cardOptions?.hidden || deviceOptions?.hidden) {
          continue;
        }

        if (entity.entity_category === "config" && configEntityHidden) {
          continue;
        }

        areaCards.push(new cardModule[className](entity, cardOptions).getCard());
      }

      // Vertical stack the area cards if it has entities.
      if (areaCards.length) {
        const titleCardOptions = ("controllerCardOptions" in this.defaultConfig) ? this.defaultConfig.controllerCardOptions : {};

        // Create and insert a Controller card.
        areaCards.unshift(new ControllerCard(target, Object.assign({title: area.name}, titleCardOptions)).createCard());

        viewCards.push({
          type: "vertical-stack",
          cards: areaCards,
        } as StackCardConfig);
      }
    }

    // Add a Controller Card for all the entities in the view.
    if (viewCards.length) {
      const entities = Helper.entitiesOfDomain(this.domain).filter(labelFilter);
      viewCards.unshift(this.createCard(entities, label));
    }

    return viewCards;
  }

  /**
   * Get a view array of domain.
   *
   * The view includes the cards which are created by method createViewCards().
   *
   * @returns {Promise<LovelaceViewConfig[]>} The view arrays of domain.
   */
  async getView(): Promise<(ViewConfig)[]> {
    const msLabelsOfDomain = this.domain ? Helper.labelsOfDomain(this.domain) : [];
    const views = (await Promise.all(msLabelsOfDomain
      .map(async label => await this.createViewCards(entity => entity.labels.includes(label), label.replace(this.prefix, ''),))))
      .map((cards, index) => ({
        title: msLabelsOfDomain[index].replace(this.prefix, ""),
        ...this.defaultConfig,
        icon: Helper.labels.find(label => label.name === msLabelsOfDomain[index])?.icon || this.defaultConfig.icon,
        path: msLabelsOfDomain[index].replace(this.prefix, "").toLowerCase(),
        ...Helper.strategyOptions.views[msLabelsOfDomain[index]],
        id: msLabelsOfDomain[index], // prevent to override by strategyOptions
        cards,
      }));

    const mainView = ({
      ...this.defaultConfig,
      ...Helper.strategyOptions.views[this.domain ?? this.defaultConfig.title?.toLowerCase()],
      id: this.defaultConfig.id, // prevent to override by strategyOptions
      cards: await this.createViewCards(entity => !this.prefix || !entity.labels.some(label => label.startsWith(this.prefix))),
    });


    return [mainView, ...views];
  }




}

export {AbstractView};
