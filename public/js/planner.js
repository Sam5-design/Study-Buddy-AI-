document.addEventListener('DOMContentLoaded', () => {
  // Materialize selects.
  if (window.M) {
    M.FormSelect.init(document.querySelectorAll('select'));
    M.updateTextFields();
  }

  // Subject colour selector.
  document.querySelectorAll('[data-colour-picker]').forEach((picker) => {
    const hidden = document.getElementById('colour');
    picker.querySelectorAll('[data-colour]').forEach((button) => {
      button.addEventListener('click', () => {
        picker.querySelectorAll('[data-colour]').forEach((item) =>
          item.classList.remove('selected')
        );
        button.classList.add('selected');
        if (hidden) hidden.value = button.dataset.colour;
      });
    });
  });

  // Make custom priority chips visually track radio state.
  document.querySelectorAll('.sb-priority-group').forEach((group) => {
    group.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        group.querySelectorAll('.sb-priority-option').forEach((option) =>
          option.classList.remove('selected')
        );
        radio.closest('.sb-priority-option').classList.add('selected');
      });
    });
  });

  // Show the loading state immediately when plan generation starts.
  const generateForm = document.getElementById('generatePlanForm');
  const overlay = document.getElementById('loadingOverlay');
  if (generateForm && overlay) {
    generateForm.addEventListener('submit', () => {
      overlay.classList.remove('hide');
    });
  }
});
