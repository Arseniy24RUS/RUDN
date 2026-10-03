/** Bind the unchanged supplied road catalogue to the canonical added city rows. */
import {transportContentHash,transportWorldDefinition} from './transport-policy-v1.mjs';
import {FEDERAL_CITIES,FEDERAL_CITY_PROVENANCE,sourceWorldFor} from './federal-cities.mjs';

export function deriveFederalDistancePolicy(world,source,policy){
  const city=FEDERAL_CITIES[world?.region?.id];
  if(!city||world===source||sourceWorldFor(world)!==source||world.rows.length!==source.rows.length+city.rows.length)throw new Error('Неизвестное дополнение региональных данных');
  for(const [index,row] of city.rows.entries()){
    const actual=world.rows[source.rows.length+index];
    for(const field of ['id','rawId','lat','lon','population','population2010','children'])if(actual[field]!==row[field])throw new Error('Данные федерального города изменены');
  }
  const definition=transportWorldDefinition(world),baseDefinition=transportWorldDefinition(source);
  if(definition.keysHash!==baseDefinition.keysHash||definition.keys.length!==baseDefinition.keys.length)throw new Error('Дополнение не должно добавлять вымышленные дороги');
  for(const [mode,adjacency] of [['walk',world.walk],['drive',world.drive]]){
    if(adjacency.length!==world.rows.length)throw new Error('Некорректный дополненный граф');
    for(let i=0;i<adjacency.length;i++)if(JSON.stringify(adjacency[i])!==JSON.stringify(source[mode][i]||[]))throw new Error('Исходные транспортные связи изменены');
  }
  const fingerprint='sha256:'+transportContentHash(JSON.stringify({version:policy.version,source:policy.fingerprint,
    supplement:FEDERAL_CITY_PROVENANCE.version,sourceRows:city.sourceRowsSha256,worldHash:definition.worldHash}));
  return Object.freeze({version:policy.version,fingerprint,roadRequired:policy.roadRequired,distanceMeters:policy.distanceMeters});
}
