(function () {
  "use strict";
  var form = document.querySelector(".auth-form");
  var message = document.querySelector(".auth-message");
  if (!form || !message) return;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var confirmPassword = form.querySelector("#confirm-password");
    var password = form.querySelector("#password");
    if (confirmPassword && password && confirmPassword.value !== password.value) {
      message.textContent = "Passwords do not match yet.";
      confirmPassword.focus();
      return;
    }
    message.textContent = form.dataset.mode === "register"
      ? "Your account form is ready to connect to registration."
      : "Your login form is ready to connect to authentication.";
  });
})();