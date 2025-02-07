const modeOptions = [
  { value: 'global', label: 'Global Settings' },
  { value: 'site', label: 'Site Settings' },
  { value: 'disabled', label: 'Disabled' }, // Updated from 'default'
];

const renderModeDescription = (mode: string) => {
  switch (mode) {
    case 'global':
      return 'Using global settings for all sites';
    case 'site':
      return 'Using custom settings for this site';
    case 'disabled':
      return 'Extension disabled for this site'; // Updated description
    default:
      return '';
  }
};
