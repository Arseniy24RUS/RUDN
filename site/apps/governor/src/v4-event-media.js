(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const decision = stem => 'v4/media/decisions/' + stem + '.webp';
  const situation = stem => 'v4/media/events/' + stem + '.webp';

  const scenes = {
    'LANDMARK-01': situation('meteorite-aftermath'),
    'LANDMARK-02': situation('dam-breach'),
    'LANDMARK-03': situation('presidential-visit'),
    'LANDMARK-04': situation('winter-olympics-bid'),
    'TRANSPORT-02': situation('snow-clearance'),
    'TRANSPORT-03': 'v3/events/commuter-transport-800.webp',
    'TRANSPORT-08': situation('station-bikes'),
    'TRANSPORT-09': 'v3/events/commuter-transport-800.webp',
    'UTILITY-01': decision('district-heating'),
    'UTILITY-03': situation('village-fuel-delivery'),
    'UTILITY-05': decision('accessible-street'),
    'UTILITY-07': situation('repair-workshop'),
    'UTILITY-08': decision('water-network'),
    'UTILITY-09': situation('station-restrooms'),
    'UTILITY-10': situation('waste-collection-yard'),
    'ECOLOGY-02': situation('air-monitoring'),
    'ECOLOGY-03': decision('green-street'),
    'ECOLOGY-05': situation('waste-collection-yard'),
    'ECOLOGY-07': decision('green-street'),
    'ECOLOGY-09': situation('landfill-remediation'),
    'ECOLOGY-10': decision('green-street'),
    'SOCIAL-04': decision('community-arts'),
    'SOCIAL-07': decision('adaptive-sports'),
    'SOCIAL-09': situation('library-delivery'),
    'SOCIAL-10': situation('hearing-service'),
    'PUBLIC-04': decision('small-firm-contracts'),
    'PUBLIC-05': decision('family-support'),
    'PUBLIC-06': situation('private-video-desk'),
    'PUBLIC-08': situation('ferry-mobile-office'),
  };

  const livingScenes = new Set([
    'bridge-drainage','capital-service-scene','civic-tech-workshop','clean-production-line','clinic',
    'commuter-transport','digital','digital-outage-scene','family-childcare','first-job-mentoring',
    'governor-office','home-long-term-care','housing','industrial-mentoring-scene','industry',
    'mobile-medical-unit','north-access-scene','public-meeting-room','river-before-flood-scene','school',
  ]);

  function get(event) {
    const scene=event&&Object.hasOwn(scenes,event.id) ?
      {poster:'assets/'+scenes[event.id],contextOnly:true} : G.V3EventArt(event);
    if (!scene) return null;
    const existing=scene.poster.match(/\/v3\/events\/([a-z-]+)-800\.webp$/)?.[1];
    const authored=scene.poster.match(/\/v4\/media\/(?:decisions|events)\/([a-z-]+)\.webp$/)?.[1];
    const motion=authored?'story-'+authored:livingScenes.has(existing)?existing:null;
    return motion?{...scene,gif:'assets/v4/media/event-motion/'+motion+'.gif'}:scene;
  }

  G.V4EventMedia=Object.freeze({get});
})(globalThis);
