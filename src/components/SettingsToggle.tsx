// ...existing code...
<Toggle
  checked={!isDisabled} // Updated from !isDefault
  onChange={handleToggle}
  aria-label={isDisabled ? 'Enable extension for this site' : 'Disable extension for this site'} // Updated text
/>
<span>{isDisabled ? 'Disabled' : 'Enabled'}</span> // Updated text
// ...existing code...
