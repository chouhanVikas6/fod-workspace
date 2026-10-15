export const handleServerError = (
    alertHeading: string = "Alert!",
    alertMessage: string = "Server Error, please refresh the system."
  ): void => {
    if (typeof window === 'undefined') return;
  
    // Display alert with custom heading and message
    window.alert(`${alertHeading} - ${alertMessage}`);
  
    // Reload the page
    window.location.reload(); // Use reload(true) for forced reload
  };
