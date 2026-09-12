(function () {
  "use strict";

  var toast = document.querySelector(".toast-message");
  var toastTimer;
  var showToast = function (message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 3600);
  };

  var sidenav = document.querySelectorAll(".sidenav");
  if (window.M && sidenav.length) {
    M.Sidenav.init(sidenav, { edge: "right" });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      var target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      var instance = window.M && M.Sidenav.getInstance(document.getElementById("mobile-navigation"));
      if (instance) instance.close();
    });
  });

  var dayData = {
    Monday: ["Read Ch. 04 notes", "Dinner + reset", "1.5h of focused time"],
    Tuesday: ["SIT789 revision", "Walk + reset", "1.5h of focused time"],
    Wednesday: ["Draft report section", "Open evening", "1h of focused time"],
    Thursday: ["Lab preparation", "Dinner + reset", "1.5h of focused time"],
    Friday: ["SIT728 deadline check", "Free evening", "45m of focused time"],
    Saturday: ["Catch-up study", "Open afternoon", "2h of focused time"],
    Sunday: ["Plan next week", "Rest and recharge", "45m of focused time"]
  };
  var dayName = document.getElementById("hero-day-name");
  var dayHours = document.getElementById("hero-day-hours");
  var sessionTitle = document.getElementById("hero-session-title");
  var openTitle = document.getElementById("hero-open-title");
  document.querySelectorAll(".day").forEach(function (day) {
    day.addEventListener("click", function () {
      document.querySelectorAll(".day").forEach(function (item) {
        item.classList.remove("is-active");
        item.setAttribute("aria-selected", "false");
      });
      day.classList.add("is-active");
      day.setAttribute("aria-selected", "true");
      var selected = dayData[day.dataset.day] || dayData.Monday;
      dayName.textContent = day.dataset.day;
      dayHours.textContent = selected[2];
      sessionTitle.textContent = selected[0];
      openTitle.textContent = selected[1];
    });
  });

  var detailToggle = document.querySelector(".js-plan-toggle");
  var detailPanel = document.querySelector(".plan-detail");
  if (detailToggle && detailPanel) {
    detailToggle.addEventListener("click", function () {
      var open = detailPanel.classList.toggle("is-visible");
      detailPanel.setAttribute("aria-hidden", String(!open));
      detailToggle.setAttribute("aria-expanded", String(open));
      detailToggle.innerHTML = open ? "Hide details <span>↑</span>" : "Show details <span>↓</span>";
    });
  }

  var revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries, currentObserver) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealItems.forEach(function (item) { observer.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add("is-visible"); });
  }
})();