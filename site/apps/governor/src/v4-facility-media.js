(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const media = 'assets/v4/media/facilities/';
  const districtStage = kind => 'assets/v4/facility-' + kind + '-';
  const works = {
    school: 'assets/v3/new-school-',
    clinic: districtStage('north'),
    levee: districtStage('river'),
    warehouse: districtStage('industrial'),
    office: districtStage('capital'),
    nursery: media + 'nursery/',
    housing: media + 'housing/',
    river: media + 'river/',
    transport: media + 'transport/',
  };

  const projects = {
    'school-campus': ['school'],
    clinics: ['clinic'],
    defenses: ['levee'],
    'industrial-park': ['warehouse','assets/illustrated/industry.webp'],
    'single-window': ['office'],
    'modular-nursery': ['nursery'],
    'youth-rental': ['housing',media+'housing/youth-rental.webp'],
    'nature-buffer': ['river','assets/services/river-nature-buffer.webp'],
    'agro-cold-chain': ['warehouse',media+'warehouse/cold-chain.webp'],
    'medical-hub': ['clinic',media+'clinic/medical-hub.webp'],
    'research-campus': ['office',media+'office/research-campus.webp'],
    'integrated-social-centre': ['office','assets/services/intergenerational-centre.webp'],
    'logistics-embankment': ['transport',media+'transport/river-road.webp'],
    'career-transition-campus': ['office',media+'office/training-centre.webp'],
    'affordable-supported-homes': ['housing',media+'housing/supported-homes.webp'],
    'resilient-relocation': ['housing',media+'housing/relocation.webp'],
    'county-freight-hubs': ['warehouse',media+'warehouse/rail-freight.webp'],
    'river-restoration': ['river',media+'river/restored-banks.webp'],
  };

  const buildStages = new Set(['foundation','frame','finishing']);
  const fullPlane = {width:1,height:1,offsetX:0,offsetY:0};
  const smallCrew = {width:.54,height:.54,offsetX:.49,offsetY:.51};

  function get(id,status) {
    if (!Object.hasOwn(projects,id)) return null;
    const [type,opened] = projects[id];
    const stage = status==='restoring'?'finishing':buildStages.has(status)?status:'open';
    const building = opened&&stage==='open'?opened:works[type]+stage+'.webp';
    let loop=null;
    if (buildStages.has(stage)) {
      loop=type==='school' ?
        {src:'assets/v4/motion/work-'+stage+'.gif',...smallCrew} :
        {src:media+type+'/'+stage+'.gif',...fullPlane};
    } else if (status==='open') {
      loop={src:media+'operating/'+id+'.gif',...fullPlane};
    }
    return {building,loop,type};
  }

  G.V4FacilityMedia=Object.freeze({get});
})(globalThis);
