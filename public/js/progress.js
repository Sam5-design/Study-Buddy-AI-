(function () {
  "use strict";
  var button = document.querySelector(".mobile-menu-button");
  var sidebar = document.getElementById("app-sidebar");
  if (!button || !sidebar) return;

  button.addEventListener("click", function () {
    var isOpen = sidebar.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  sidebar.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      sidebar.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation");
    });
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 700) {
      sidebar.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }
  });
})();