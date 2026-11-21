// The Chapter 1 files, imported statically so the app, the worker and Node tools load the same set.
import activities from './data/ch1/activities.json';
import anchor from './data/ch1/anchor.json';
import cards from './data/ch1/cards.json';
import cast from './data/ch1/cast.json';
import detectors from './data/ch1/detectors.json';
import economy from './data/ch1/economy.json';
import hooks from './data/ch1/hooks.json';
import map from './data/ch1/map.json';
import objects from './data/ch1/objects.json';
import powers from './data/ch1/powers.json';
import storylets from './data/ch1/storylets.json';
import textEn from './data/ch1/text/en.json';
import textRu from './data/ch1/text/ru.json';
import world from './data/ch1/world.json';
import pinsets from './data/pinsets.json';
import tuning from './data/tuning.json';
import type { ChapterFiles } from './load';

export const CHAPTER1_FILES: ChapterFiles = {
  world,
  map,
  cast,
  hooks,
  activities,
  objects,
  cards,
  powers,
  storylets,
  detectors,
  anchor,
  economy,
  textEn,
  textRu,
};

export const TUNING_FILE: unknown = tuning;

export const PINSETS_FILE: unknown = pinsets;
