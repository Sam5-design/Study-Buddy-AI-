(function () {
  "use strict";
  var form = document.querySelector(".auth-form");
  var message = document.querySelector(".auth-message");
  if (!form || !message) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var email = form.querySelector("#email");
    var password = form.querySelector("#password");
    var mode = form.dataset.mode;

    if (mode === "register") {
      var fullName = form.querySelector("#full-name");
      var confirmPassword = form.querySelector("#confirm-password");

      if (confirmPassword && password && confirmPassword.value !== password.value) {
        message.textContent = "Passwords do not match yet.";
        confirmPassword.focus();
        return;
      }

      fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName ? fullName.value : undefined,
          email: email ? email.value : undefined,
          password: password ? password.value : undefined
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          message.textContent = data.message || "Registered successfully!";
          if (data.redirect) {
            window.location.href = data.redirect;
          }
        })
        .catch(function (err) {
          message.textContent = "Something went wrong.";
          console.error(err);
        });

    } else if (mode === "login") {
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email ? email.value : undefined,
          password: password ? password.value : undefined
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          message.textContent = data.message || "Logged in successfully!";
          if (data.redirect) {
            window.location.href = data.redirect;
          }
        })
        .catch(function (err) {
          message.textContent = "Something went wrong.";
          console.error(err);
        });
    }
  });
})();