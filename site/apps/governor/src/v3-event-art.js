(function (root) {
  'use strict';
  const registry = {
  "EDU-01": {
    "poster": "assets/v3/school-street.webp",
    "small": "assets/v3/school-street-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-02": {
    "poster": "assets/v3/events/school-800.webp",
    "small": "assets/v3/events/school-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-03": {
    "poster": "assets/v3/events/first-job-mentoring-800.webp",
    "small": "assets/v3/events/first-job-mentoring-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-04": {
    "poster": "assets/v3/events/school-800.webp",
    "small": "assets/v3/events/school-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-05": {
    "poster": "assets/v3/events/school-800.webp",
    "small": "assets/v3/events/school-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-06": {
    "poster": "assets/v3/events/family-childcare-800.webp",
    "small": "assets/v3/events/family-childcare-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-07": {
    "poster": "assets/v3/events/school-800.webp",
    "small": "assets/v3/events/school-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-08": {
    "poster": "assets/v3/events/school-800.webp",
    "small": "assets/v3/events/school-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-09": {
    "poster": "assets/v3/events/school-800.webp",
    "small": "assets/v3/events/school-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "EDU-10": {
    "poster": "assets/v3/events/industrial-mentoring-scene-800.webp",
    "small": "assets/v3/events/industrial-mentoring-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-01": {
    "poster": "assets/v3/events/north-access-scene-800.webp",
    "small": "assets/v3/events/north-access-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-02": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-03": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-04": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-05": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-06": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-07": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-08": {
    "poster": "assets/v3/events/mobile-medical-unit-800.webp",
    "small": "assets/v3/events/mobile-medical-unit-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-09": {
    "poster": "assets/v3/events/clinic-800.webp",
    "small": "assets/v3/events/clinic-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HEALTH-10": {
    "poster": "assets/v3/events/mobile-medical-unit-800.webp",
    "small": "assets/v3/events/mobile-medical-unit-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "TRANSPORT-01": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "TRANSPORT-02": null,
  "TRANSPORT-03": null,
  "TRANSPORT-04": {
    "poster": "assets/v3/events/industrial-mentoring-scene-800.webp",
    "small": "assets/v3/events/industrial-mentoring-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "TRANSPORT-05": {
    "poster": "assets/v3/events/commuter-transport-800.webp",
    "small": "assets/v3/events/commuter-transport-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "TRANSPORT-06": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "TRANSPORT-07": {
    "poster": "assets/v3/events/north-access-scene-800.webp",
    "small": "assets/v3/events/north-access-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "TRANSPORT-08": null,
  "TRANSPORT-09": null,
  "TRANSPORT-10": {
    "poster": "assets/v3/school-street.webp",
    "small": "assets/v3/school-street-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "UTILITY-01": null,
  "UTILITY-02": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "UTILITY-03": null,
  "UTILITY-04": {
    "poster": "assets/v3/events/digital-800.webp",
    "small": "assets/v3/events/digital-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "UTILITY-05": null,
  "UTILITY-06": {
    "poster": "assets/v3/events/bridge-drainage-800.webp",
    "small": "assets/v3/events/bridge-drainage-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "UTILITY-07": null,
  "UTILITY-08": null,
  "UTILITY-09": null,
  "UTILITY-10": null,
  "ECOLOGY-01": {
    "poster": "assets/v3/river-event.webp",
    "small": "assets/v3/river-event-480.webp",
    "contextOnly": true,
    "motion": "river"
  },
  "ECOLOGY-02": null,
  "ECOLOGY-03": null,
  "ECOLOGY-04": {
    "poster": "assets/v3/events/north-access-scene-800.webp",
    "small": "assets/v3/events/north-access-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECOLOGY-05": null,
  "ECOLOGY-06": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECOLOGY-07": null,
  "ECOLOGY-08": {
    "poster": "assets/v3/events/clean-production-line-800.webp",
    "small": "assets/v3/events/clean-production-line-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECOLOGY-09": null,
  "ECOLOGY-10": null,
  "ECONOMY-01": {
    "poster": "assets/v3/events/industrial-mentoring-scene-800.webp",
    "small": "assets/v3/events/industrial-mentoring-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-02": {
    "poster": "assets/v3/events/industry-800.webp",
    "small": "assets/v3/events/industry-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-03": {
    "poster": "assets/v3/events/industry-800.webp",
    "small": "assets/v3/events/industry-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-04": {
    "poster": "assets/v3/events/north-access-scene-800.webp",
    "small": "assets/v3/events/north-access-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-05": {
    "poster": "assets/v3/events/commuter-transport-800.webp",
    "small": "assets/v3/events/commuter-transport-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-06": {
    "poster": "assets/v3/events/industry-800.webp",
    "small": "assets/v3/events/industry-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-07": {
    "poster": "assets/v3/events/industrial-mentoring-scene-800.webp",
    "small": "assets/v3/events/industrial-mentoring-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-08": {
    "poster": "assets/v3/events/industry-800.webp",
    "small": "assets/v3/events/industry-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-09": {
    "poster": "assets/v3/events/first-job-mentoring-800.webp",
    "small": "assets/v3/events/first-job-mentoring-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "ECONOMY-10": {
    "poster": "assets/v3/events/industry-800.webp",
    "small": "assets/v3/events/industry-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-01": {
    "poster": "assets/v3/events/home-long-term-care-800.webp",
    "small": "assets/v3/events/home-long-term-care-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-02": {
    "poster": "assets/v3/events/home-long-term-care-800.webp",
    "small": "assets/v3/events/home-long-term-care-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-03": {
    "poster": "assets/v3/events/capital-service-scene-800.webp",
    "small": "assets/v3/events/capital-service-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-04": null,
  "SOCIAL-05": {
    "poster": "assets/v3/events/family-childcare-800.webp",
    "small": "assets/v3/events/family-childcare-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-06": {
    "poster": "assets/v3/events/north-access-scene-800.webp",
    "small": "assets/v3/events/north-access-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-07": null,
  "SOCIAL-08": {
    "poster": "assets/v3/events/family-childcare-800.webp",
    "small": "assets/v3/events/family-childcare-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "SOCIAL-09": null,
  "SOCIAL-10": null,
  "HOUSING-01": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-02": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-03": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-04": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-05": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-06": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-07": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-08": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-09": {
    "poster": "assets/v3/events/housing-800.webp",
    "small": "assets/v3/events/housing-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "HOUSING-10": {
    "poster": "assets/v3/events/industrial-mentoring-scene-800.webp",
    "small": "assets/v3/events/industrial-mentoring-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "PUBLIC-01": {
    "poster": "assets/v3/events/capital-service-scene-800.webp",
    "small": "assets/v3/events/capital-service-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "PUBLIC-02": {
    "poster": "assets/v3/events/digital-outage-scene-800.webp",
    "small": "assets/v3/events/digital-outage-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "PUBLIC-03": {
    "poster": "assets/v3/events/civic-tech-workshop-800.webp",
    "small": "assets/v3/events/civic-tech-workshop-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "PUBLIC-04": null,
  "PUBLIC-05": null,
  "PUBLIC-06": null,
  "PUBLIC-07": {
    "poster": "assets/v3/events/capital-service-scene-800.webp",
    "small": "assets/v3/events/capital-service-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "PUBLIC-08": null,
  "PUBLIC-09": {
    "poster": "assets/v3/events/civic-tech-workshop-800.webp",
    "small": "assets/v3/events/civic-tech-workshop-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "PUBLIC-10": {
    "poster": "assets/v3/events/public-meeting-room-800.webp",
    "small": "assets/v3/events/public-meeting-room-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-01": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-02": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-03": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-04": {
    "poster": "assets/v3/events/river-before-flood-scene-800.webp",
    "small": "assets/v3/events/river-before-flood-scene-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-05": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-06": {
    "poster": "assets/v3/events/civic-tech-workshop-800.webp",
    "small": "assets/v3/events/civic-tech-workshop-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-07": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-08": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-09": {
    "poster": "assets/v3/events/bridge-drainage-800.webp",
    "small": "assets/v3/events/bridge-drainage-480.webp",
    "contextOnly": true,
    "motion": null
  },
  "BUDGET-10": {
    "poster": "assets/v3/events/governor-office-800.webp",
    "small": "assets/v3/events/governor-office-480.webp",
    "contextOnly": true,
    "motion": null
  }
};
  // For cards without a suitable narrative scene, show the category emblem
  // rather than imply that a specific facility or result already exists.
  const themes = {
    edu:'school', health:'clinic', transport:'barrier', utility:'construction',
    ecology:'barrier', economy:'industry', social:'housing', housing:'housing',
    public:'digital', budget:'stage-decision'
  };
  root.GovernorGame.V3EventArt = event => {
    if (!event) return null;
    const explicit = registry[event.id];
    if (explicit) return explicit;
    const topic = themes[event.topic];
    if (!topic) return null;
    const path = 'assets/illustrated/'+topic+'-thumb.webp';
    return {poster:path,small:path,contextOnly:true,emblem:true,motion:null};
  };
})(globalThis);
