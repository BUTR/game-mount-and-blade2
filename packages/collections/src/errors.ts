export class CollectionGenerateError extends Error {
  constructor(why: string) {
    super(`Failed to generate game specific data for collection: ${why}`);
    this.name = "CollectionGenerateError";
  }
}

export class CollectionParseError extends Error {
  constructor(collectionName: string, why: string) {
    super(
      `Failed to parse game specific data for collection ${collectionName}: ${why}`,
    );
    this.name = "CollectionGenerateError";
  }
}
